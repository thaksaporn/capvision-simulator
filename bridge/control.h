#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
enum {CV_OK=0,CV_PC_LOST=1,CV_ENCODER_STALL,CV_DIRECTION,CV_SPACING,CV_QUEUE,
 CV_OVERRUN,CV_VISION_TIMEOUT,CV_RESULT_ID,CV_SEQUENCE,CV_OVERLAP,CV_CONFIRM,
 CV_B_HOME,CV_B_CONFIRM,CV_WATCHDOG,CV_LOOP_LATE,CV_PROTOCOL};
enum {CV_REQUEST=1,CV_PASS,CV_A_FIRE,CV_A_OK,CV_A_MISS,CV_B_FIRE,CV_B_OK,CV_FAULT,CV_STOP};
typedef struct {uint32_t kind,id,session; int64_t position;} CvEvent;
/* Confirmation windows are positions relative to entry, in encoder counts.
 * Defaults are SIMULATION assumptions, not measured machine dimensions. */
typedef struct {int64_t camera,a,b,exit,min_gap,overrun,a_min,a_max,b_min,b_max;
 uint32_t camera_ms,a_ms,b_ms,vision_ms,a_confirm_ms,b_confirm_ms,pc_ms,stall_ms,home_ms,loop_ms;} CvConfig;
typedef struct {uint32_t id,state;int64_t origin;uint64_t since;} CvCap;
typedef struct {uint32_t seq,id,pass,session;uint8_t used;} CvAck;
typedef struct {
 CvConfig cfg;CvCap caps[16];CvAck history[64];CvEvent events[64];
 uint32_t session,next_id,fault,count,pass_count,a_count,b_count,unresolved;
 uint32_t ack_slot,ev_read,ev_write,rx_seq,hb_seq;uint64_t hb_pc_ms;uint8_t active,armed,pc_seen,home,busy,left_home;
 uint8_t camera,a,b,ready,healthy,hb,have_entry;
 int64_t position,last_entry;uint64_t now,last_pc,last_motion,last_tick,b_since,deadline[3];
} Cv;
CvConfig cv_defaults(void);
void cv_init(Cv*,const CvConfig*);
int cv_hello(Cv*,uint32_t session,uint64_t now);
int cv_heartbeat(Cv*,uint32_t session,uint64_t now);
void cv_stop(Cv*);
int cv_reset(Cv*,int enable);
void cv_fail(Cv*,uint32_t code);
/* enable is physical PLC Y5; edges are one-shot rising events. */
void cv_tick(Cv*,uint64_t now,int64_t position,int enable,int home,int entry,int confirm_a,int confirm_b,int wd_ok);
int cv_result(Cv*,uint32_t session,uint32_t id,int pass,uint32_t seq);
int cv_event(Cv*,CvEvent*);
#ifdef __cplusplus
}
#endif
