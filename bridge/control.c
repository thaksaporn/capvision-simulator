#include "control.h"
#include <string.h>
enum {CAMERA=1,VISION,PASS,A_WAIT,A_CONFIRM,B_WAIT,B_CONFIRM};
CvConfig cv_defaults(void){return (CvConfig){4244,21221,32043,42043,4244,1273,
 21221,26221,32043,37043,100,200,400,1000,500,700,500,500,1900,20};}
static void emit(Cv*s,int kind,uint32_t id){
 uint32_t n=(s->ev_write+1)%64;
 if(n==s->ev_read){s->fault=CV_QUEUE;s->active=s->armed=0;s->camera=s->a=s->b=0;
  s->healthy=s->ready=0;s->unresolved+=s->count;s->count=0;s->busy=0;return;}
 s->events[s->ev_write]=(CvEvent){kind,id,s->session,s->position};s->ev_write=n;
}
int cv_event(Cv*s,CvEvent*e){if(s->ev_read==s->ev_write)return 0;*e=s->events[s->ev_read];s->ev_read=(s->ev_read+1)%64;return 1;}
void cv_init(Cv*s,const CvConfig*c){memset(s,0,sizeof(*s));s->cfg=c?*c:cv_defaults();s->next_id=1;}
void cv_stop(Cv*s){int was=s->active;s->active=s->armed=0;s->camera=s->a=s->b=0;
 s->unresolved+=s->count;s->count=0;s->busy=s->left_home=s->have_entry=0;
 if(was)emit(s,CV_STOP,0);}
void cv_fail(Cv*s,uint32_t code){if(!s->fault){s->fault=code;cv_stop(s);emit(s,CV_FAULT,code);}s->healthy=s->ready=0;}
int cv_hello(Cv*s,uint32_t session,uint64_t now){
 if(s->active||s->fault||!session||session==s->session)return 0;
 s->session=session;s->now=now;s->last_pc=now;s->pc_seen=s->armed=1;
 memset(s->history,0,sizeof(s->history));s->ack_slot=0;return 1;
}
int cv_heartbeat(Cv*s,uint32_t session,uint64_t now){if(!s->pc_seen||session!=s->session)return 0;s->last_pc=now;return 1;}
int cv_reset(Cv*s,int enable){if(enable)return 0;cv_stop(s);s->fault=0;s->pc_seen=0;return 1;}
static void remove_cap(Cv*s,unsigned i){if(i+1<s->count)memmove(s->caps+i,s->caps+i+1,(s->count-i-1)*sizeof(CvCap));--s->count;}
int cv_result(Cv*s,uint32_t session,uint32_t id,int pass,uint32_t seq){
 if(!s->active||session!=s->session){cv_fail(s,CV_RESULT_ID);return 0;}
 for(unsigned i=0;i<64;i++)if(s->history[i].used&&s->history[i].seq==seq){
  CvAck*a=&s->history[i];if(a->id==id&&a->pass==(uint32_t)pass&&a->session==session)return 2;
  cv_fail(s,CV_SEQUENCE);return 0;}
 if(pass!=0&&pass!=1){cv_fail(s,CV_PROTOCOL);return 0;}
 for(unsigned i=0;i<s->count;i++){CvCap*c=&s->caps[i];if(c->id==id&&c->state==VISION){
  if(s->now-c->since>=s->cfg.vision_ms){cv_fail(s,CV_VISION_TIMEOUT);return 0;}
  c->state=pass?PASS:A_WAIT;s->history[s->ack_slot]=(CvAck){seq,id,pass,session,1};s->ack_slot=(s->ack_slot+1)%64;return 1;}}
 cv_fail(s,CV_RESULT_ID);return 0;
}
static int confirm(Cv*s,int state,int64_t lo,int64_t hi,int kind){
 int found=-1;for(unsigned i=0;i<s->count;i++){CvCap*c=&s->caps[i];int64_t p=s->position-c->origin;
  uint32_t timeout=state==A_CONFIRM?s->cfg.a_confirm_ms:s->cfg.b_confirm_ms;
  if(c->state==(uint32_t)state&&p>=lo&&p<=hi&&s->now-c->since<timeout){if(found>=0)return 0;found=(int)i;}}
 if(found<0){return 0;}
 emit(s,kind,s->caps[found].id);remove_cap(s,(unsigned)found);
 if(state==A_CONFIRM)s->a_count++;else s->b_count++;return 1;
}
void cv_tick(Cv*s,uint64_t now,int64_t pos,int enable,int home,int entry,int ca,int cb,int wd){
 if(now<s->now){cv_fail(s,CV_LOOP_LATE);return;}
 uint64_t gap=now-s->last_tick;s->last_tick=now;s->now=now;s->home=!!home;
 if(pos!=s->position)s->last_motion=now;
 if(s->active&&pos<s->position){cv_fail(s,CV_DIRECTION);return;}s->position=pos;
 if(now>=s->deadline[0]){s->camera=0;}
 if(now>=s->deadline[1]){s->a=0;}
 if(now>=s->deadline[2]){s->b=0;}
 if(!enable&&s->active)cv_stop(s);
 int pc=s->pc_seen&&now-s->last_pc<s->cfg.pc_ms;
 /* Healthy is not gated by Home; Home is START readiness only. */
 s->healthy=!s->fault&&pc&&wd;s->ready=s->healthy&&s->armed&&home&&!s->busy;
 s->hb=(uint8_t)((now/100)&1);
 if(s->fault)return;
 if(enable&&!s->active){if(!s->ready)return;s->active=1;s->last_motion=now;}
 if(!s->active)return;
 if(!wd){cv_fail(s,CV_WATCHDOG);return;}if(!pc){cv_fail(s,CV_PC_LOST);return;}
 if(gap>s->cfg.loop_ms){cv_fail(s,CV_LOOP_LATE);return;}
 if(now-s->last_motion>=s->cfg.stall_ms){cv_fail(s,CV_ENCODER_STALL);return;}
 if(s->busy){if(!home)s->left_home=1;
  if(!s->left_home&&now-s->b_since>=200){cv_fail(s,CV_B_HOME);return;}
  if(s->left_home&&home&&!s->b)s->busy=0;
  else if(now-s->b_since>=s->cfg.home_ms){cv_fail(s,CV_B_HOME);return;}}
 if(ca&&!confirm(s,A_CONFIRM,s->cfg.a_min,s->cfg.a_max,CV_A_OK)){cv_fail(s,CV_CONFIRM);return;}
 if(cb&&!confirm(s,B_CONFIRM,s->cfg.b_min,s->cfg.b_max,CV_B_OK)){cv_fail(s,CV_CONFIRM);return;}
 if(entry){if(s->count==16){cv_fail(s,CV_QUEUE);return;}
  if(s->have_entry&&pos-s->last_entry<s->cfg.min_gap){cv_fail(s,CV_SPACING);return;}
  if(s->next_id==0){cv_fail(s,CV_SEQUENCE);return;}
  s->caps[s->count++]=(CvCap){s->next_id++,CAMERA,pos,now};s->last_entry=pos;s->have_entry=1;}
 for(unsigned i=0;i<s->count;){CvCap*c=&s->caps[i];int64_t p=pos-c->origin;int gone=0;
  switch(c->state){
   case CAMERA:if(p>=s->cfg.camera){if(p-s->cfg.camera>s->cfg.overrun||s->camera){cv_fail(s,CV_OVERRUN);return;}
    s->camera=1;s->deadline[0]=now+s->cfg.camera_ms;c->state=VISION;c->since=now;emit(s,CV_REQUEST,c->id);}break;
   case VISION:if(now-c->since>=s->cfg.vision_ms){cv_fail(s,CV_VISION_TIMEOUT);return;}break;
   case PASS:if(p>=s->cfg.exit){s->pass_count++;emit(s,CV_PASS,c->id);gone=1;}break;
   case A_WAIT:if(p>=s->cfg.a){if(p-s->cfg.a>s->cfg.overrun||s->a){cv_fail(s,CV_OVERLAP);return;}
    s->a=1;s->deadline[1]=now+s->cfg.a_ms;c->state=A_CONFIRM;c->since=now;emit(s,CV_A_FIRE,c->id);}break;
   case A_CONFIRM:if(now-c->since>=s->cfg.a_confirm_ms){c->state=B_WAIT;emit(s,CV_A_MISS,c->id);}break;
   case B_WAIT:if(p>=s->cfg.b){if(p-s->cfg.b>s->cfg.overrun||s->b||s->busy||!home){cv_fail(s,CV_B_HOME);return;}
    s->b=1;s->deadline[2]=now+s->cfg.b_ms;s->busy=1;s->left_home=0;s->b_since=now;
    c->state=B_CONFIRM;c->since=now;emit(s,CV_B_FIRE,c->id);}break;
   case B_CONFIRM:if(now-c->since>=s->cfg.b_confirm_ms){cv_fail(s,CV_B_CONFIRM);return;}break;
  }
  if(gone)remove_cap(s,i);else ++i;
 }
}
