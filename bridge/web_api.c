#include "control.h"
static Cv b;static CvEvent e;
void web_init(void){CvConfig c=cv_defaults();c.camera=10600;c.a=26600;c.b=36800;c.exit=43200;c.min_gap=4244;c.a_min=26600;c.a_max=31600;c.b_min=36800;c.b_max=41800;cv_init(&b,&c);}
int web_hello(int session,double ms){return cv_hello(&b,(uint32_t)session,(uint64_t)ms);}
void web_heartbeat(int session,double ms){cv_heartbeat(&b,(uint32_t)session,(uint64_t)ms);}
int web_reset(int enabled){return cv_reset(&b,enabled);}
void web_tick(double ms,double position,int enable,int home,int entry,int a,int bb,int wd){cv_tick(&b,(uint64_t)ms,(int64_t)position,enable,home,entry,a,bb,wd);}
int web_result(int session,int id,int pass,int seq){return cv_result(&b,session,id,pass,seq);}
int web_event(void){return cv_event(&b,&e);}
double web_event_get(int i){switch(i){case 0:return e.kind;case 1:return e.id;case 2:return (double)e.position;default:return 0;}}
double web_get(int i){switch(i){case 0:return b.active;case 1:return b.fault;case 2:return b.ready;case 3:return b.healthy;case 4:return b.hb;case 5:return b.camera;case 6:return b.a;case 7:return b.b;case 8:return b.count;case 9:return b.pass_count;case 10:return b.a_count;case 11:return b.b_count;case 12:return b.unresolved;case 13:return b.busy;case 14:return b.next_id;default:return 0;}}
