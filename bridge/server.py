"""Local-only CapVision web and PLC bridge. Python standard library, no installs.
All PLC connections and writes require explicit UI actions. No automatic scan.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import argparse,json,secrets,threading,time,subprocess,queue,ipaddress,os,webbrowser
from slmp import SLMP
BASE=Path(__file__).resolve().parent;DIST=BASE.parent/'dist'
READ=['M0','M1','M2','M503','M504','M505','M506','M510','M511','M512','M513','M7000','M7001','M7190','D7190','D20','D30','X0','X1','X2']
COMMANDS={'start':'M7010','stop':'M7011','reset':'M7012','safety':'M7013','estop':'M7015'}
class MX:
 def __init__(self,station):self.station=station;self.process=None;self.replies=queue.Queue()
 def call(self,obj):
  self.process.stdin.write(json.dumps(obj)+'\n');self.process.stdin.flush()
  try:line=self.replies.get(timeout=3)
  except queue.Empty:raise TimeoutError('MX Component ไม่ตอบภายใน 3 วินาที')
  if not line:raise RuntimeError('MX worker stopped')
  r=json.loads(line)
  if 'error' in r:raise RuntimeError(r['error'])
  return r
 def open(self):
  if os.name!='nt':raise RuntimeError('GX Simulator3 ต้องใช้ Windows และ MX Component')
  exe=Path(os.environ.get('WINDIR','C:/Windows'))/'SysWOW64/WindowsPowerShell/v1.0/powershell.exe'
  self.process=subprocess.Popen([str(exe),'-NoLogo','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',str(BASE/'mx_worker.ps1')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',creationflags=subprocess.CREATE_NO_WINDOW)
  def reader():
   for line in self.process.stdout:self.replies.put(line)
   self.replies.put('')
  threading.Thread(target=reader,daemon=True).start()
  try:self.call(dict(op='open',station=self.station))
  except Exception as e:self.close();raise RuntimeError('GX ยังไม่เชื่อมต่อ: ตรวจ MX Component และ logical station / '+str(e))
 def close(self):
  if self.process:
   if self.process.poll() is None:self.process.terminate()
   self.process=None
 def read(self):return self.call(dict(op='read',devices=READ))['values']
 def write(self,values):return self.call(dict(op='write',values=values))
class Bridge:
 def __init__(self):self.lock=threading.RLock();self.device=None;self.kind='';self.armed=False;self.last_client=0;self.heartbeat=0;self.last_values={};self.estop=0
 def disconnect(self):
  with self.lock:
   if self.device:self.device.close()
   self.device=None;self.armed=False;self.kind='';self.last_values={}
 def read(self):
  if not self.device:raise RuntimeError('ยังไม่ได้เชื่อมต่อ PLC')
  if self.kind=='gx':v=self.device.read()
  else:
   v={};
   for head,count in [('M0',3),('M503',11),('M7000',2),('M7190',1),('X0',3)]:
    start=int(head[1:],8 if head[0]=='X' else 10)
    for i,val in enumerate(self.device.read_bits(head,count)):v[head[0]+(format(start+i,'o') if head[0]=='X' else str(start+i))]=val
   for head,count in [('D20',11),('D7190',1)]:
    for i,val in enumerate(self.device.read_words(head,count)):v['D'+str(int(head[1:])+i)]=val
  self.last_values=v;return v
 def connect(self,j):
  self.disconnect();kind=j.get('kind')
  if kind=='gx':
   station=int(j.get('station',1))
   if not 0<=station<=1023:raise ValueError('Logical station 0–1023')
   d=MX(station)
  elif kind=='slmp':
   ip=ipaddress.IPv4Address(j.get('host',''));port=int(j.get('port',5000))
   if not(ip.is_private or ip.is_loopback) or ip.is_multicast or ip.is_unspecified:raise ValueError('ใช้ IP ของ PLC ในเครือข่ายส่วนตัว')
   if not 1<=port<=65535:raise ValueError('TCP port ไม่ถูกต้อง')
   d=SLMP(str(ip),port)
  else:raise ValueError('Unknown connection type')
  try:
   d.open();self.device=d;self.kind=kind;self.read();self.last_client=time.monotonic()
   if kind=='gx' and (self.last_values.get('M7000')!=1 or self.last_values.get('M7001')!=0):raise RuntimeError('GX ต้องอยู่โหมด SIM: M7000=1 / M7001=0')
  except Exception:self.disconnect();raise
  return dict(message='อ่านสถานะสำเร็จ · '+('GX ต้องใช้ B2 122 บรรทัดและเปิดรับคำสั่งเพื่อจำลองบอร์ด' if kind=='gx' else 'PLC จริงเริ่มต้นเป็นอ่านอย่างเดียว · ไม่ส่งคำสั่ง RUN'),kind=kind)
 def permit(self):
  v=self.read()
  if self.kind=='gx':
   if v.get('M7000')!=1 or v.get('M7001')!=0:raise RuntimeError('หยุดเขียน: GX ออกจาก SIM หรือเปิด hardware arm')
  elif v.get('D7190')!=23107 or not v.get('M7190'):raise RuntimeError('PLC จริงยังไม่อนุญาต: ต้องติดตั้ง Ladder W1 mailbox และเปิด M7190 ใน PLC')
 def write(self,values):
  if self.kind=='gx':self.device.write(values)
  else:
   for k,v in values.items():
    if k.startswith('M'):self.device.write_bit(k,v)
    else:self.device.write_word(k,v)
 def command(self,action):
  if not self.armed:raise RuntimeError('ยังไม่ได้เปิดรับคำสั่งควบคุม')
  self.permit()
  if self.kind=='gx':
   if action not in COMMANDS:raise ValueError('คำสั่งนี้ไม่ใช่ปุ่ม PLC')
   value=1
   if action=='estop':self.estop=1-self.estop;value=self.estop
   self.write({COMMANDS[action]:value})
  else:
   if action not in ('start','stop','reset'):raise ValueError('Safety reset / E-stop ต้องใช้ฮาร์ดแวร์จริง ไม่ส่งผ่านเว็บ')
   self.write({{'start':'M7200','stop':'M7201','reset':'M7202'}[action]:1})
 def state(self):
  v=self.read();self.last_client=time.monotonic()
  if self.armed and self.kind=='slmp':self.permit();self.heartbeat=(self.heartbeat+1)&32767;self.write({'D7200':self.heartbeat})
  return dict(values=v,kind=self.kind,armed=self.armed,snapshot=dict(state=v.get('D20',0),plcFault=v.get('D30',0),boardFault=0,run=v.get('M503',0),tail=v.get('M504',0),enable=v.get('M505',0),ready=v.get('X0',0),healthy=v.get('X1',0),heartbeat=v.get('X2',0),camera=None,a=None,b=None,position=None))
 def mirror(self,j):
  if not self.armed or self.kind!='gx':raise RuntimeError('Mirror ใช้ได้เฉพาะ GX SIM ที่เปิดรับคำสั่ง')
  self.permit();self.write({'M7050':1,'M7100':int(bool(j.get('ready'))),'M7101':int(bool(j.get('healthy'))),'M7102':int(bool(j.get('heartbeat'))),'M7106':int(bool(j.get('tail'))),'M7052':int(bool(j.get('airFault')))})
 def monitor(self):
  while True:
   time.sleep(.1)
   with self.lock:
    if self.device and self.armed and time.monotonic()-self.last_client>1:
     try:
      # Withdraw simulated board HEALTHY only while confirmed GX SIM.
      if self.kind=='gx':self.permit();self.write({'M7101':0,'M7011':1})
     except Exception:pass
     self.armed=False
     # Real PLC W1 heartbeat timeout is enforced inside Ladder, independently.
bridge=Bridge();CODE=secrets.token_urlsafe(18)
ALLOWED={'https://capvision-machine-lab.nongnye1.chatgpt.site'}
class Handler(SimpleHTTPRequestHandler):
 extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.glb':'model/gltf-binary','.css':'text/css'}
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(DIST),**kw)
 def log_message(self,*args):pass
 def origin_ok(self):
  origin=self.headers.get('Origin');host=self.headers.get('Host','');return host in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'} and (not origin or origin in ALLOWED or origin in {f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'})
 def end_headers(self):
  origin=self.headers.get('Origin')
  if origin and self.origin_ok():self.send_header('Access-Control-Allow-Origin',origin);self.send_header('Vary','Origin')
  self.send_header('Cache-Control','no-store' if self.path.startswith('/api/') else 'public, max-age=60');super().end_headers()
 def reply(self,obj,status=200):
  b=json.dumps(obj,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def authorized(self):return self.origin_ok() and secrets.compare_digest(self.headers.get('X-CapVision-Code',''),CODE)
 def do_OPTIONS(self):
  if not self.origin_ok():return self.reply({'error':'Origin not allowed'},403)
  self.send_response(204);self.send_header('Access-Control-Allow-Headers','Content-Type, X-CapVision-Code');self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS');self.end_headers()
 def do_GET(self):
  if self.path=='/api/bootstrap':
   origin=self.headers.get('Origin')
   if not self.origin_ok() or (origin and origin in ALLOWED):return self.reply({'error':'Pair locally'},403)
   return self.reply({'code':CODE})
  if self.path.startswith('/api/'):
   if not self.authorized():return self.reply({'error':'Pairing code ไม่ถูกต้อง / origin ไม่อนุญาต'},403)
   try:
    with bridge.lock:
     if self.path=='/api/state':return self.reply(bridge.state())
     if self.path=='/api/health':return self.reply({'ok':True,'kind':bridge.kind,'connected':bool(bridge.device)})
    return self.reply({'error':'Not found'},404)
   except Exception as e:return self.reply({'error':str(e)},409)
  return super().do_GET()
 def do_POST(self):
  if not self.authorized():return self.reply({'error':'Pairing code ไม่ถูกต้อง / origin ไม่อนุญาต'},403)
  try:
   n=int(self.headers.get('Content-Length','0'))
   if n>4096:raise ValueError('Request too large')
   if not self.headers.get('Content-Type','').startswith('application/json'):raise ValueError('JSON required')
   j=json.loads(self.rfile.read(n))
   with bridge.lock:
    bridge.last_client=time.monotonic()
    if self.path=='/api/connect':return self.reply(bridge.connect(j))
    if self.path=='/api/disconnect':bridge.disconnect()
    elif self.path=='/api/arm':
     bridge.permit();bridge.armed=bool(j.get('enabled'))
    elif self.path=='/api/command':bridge.command(j.get('action'))
    elif self.path=='/api/mirror':bridge.mirror(j)
    else:return self.reply({'error':'Not found'},404)
   return self.reply({'ok':True})
  except Exception as e:return self.reply({'error':str(e)},409)
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8768);parser.add_argument('--open',action='store_true');args=parser.parse_args()
 server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);threading.Thread(target=bridge.monitor,daemon=True).start()
 print('CapVision local simulator: http://127.0.0.1:'+str(args.port),flush=True);print('Pairing code: '+CODE,flush=True);print('No PLC connected. Open the Connect tab to select a target.',flush=True)
 if args.open:webbrowser.open('http://127.0.0.1:'+str(args.port))
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:bridge.disconnect();server.server_close()
if __name__=='__main__':main()
