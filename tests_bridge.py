from pathlib import Path
import unittest,sys,socket,threading,struct,json,urllib.request,urllib.error
sys.path.insert(0,str(Path(__file__).parent/'bridge'))
from slmp import SLMP
import server
class MockPLC:
 def __init__(self):
  self.mem={'M7000':0,'M7001':0,'M7190':0,'D7190':0,'D20':10};self.writes=[];self.error=0
  self.s=socket.socket();self.s.bind(('127.0.0.1',0));self.s.listen();self.port=self.s.getsockname()[1]
  threading.Thread(target=self.serve,daemon=True).start()
 def exact(self,c,n):
  b=b''
  while len(b)<n:
   x=c.recv(n-len(b))
   if not x:return None
   b+=x
  return b
 def serve(self):
  while True:
   try:c,_=self.s.accept()
   except OSError:return
   with c:
    while True:
     h=self.exact(c,9)
     if not h:break
     b=self.exact(c,int.from_bytes(h[7:9],'little'));_,cmd,sub=struct.unpack('<HHH',b[:6]);number=int.from_bytes(b[6:9],'little');code=b[9];count=int.from_bytes(b[10:12],'little');prefix={0x90:'M',0xa8:'D',0x9c:'X',0x9d:'Y'}[code]
     key=lambda i:prefix+(format(number+i,'o') if prefix in 'XY' else str(number+i))
     data=b''
     if cmd==0x0401:
      vals=[self.mem.get(key(i),0) for i in range(count)]
      if sub==1:data=bytes((vals[i]<<4)|(vals[i+1] if i+1<count else 0) for i in range(0,count,2))
      else:data=struct.pack('<'+'H'*count,*vals)
     elif cmd==0x1401:
      value=(b[12]>>4)&1 if sub==1 else int.from_bytes(b[12:14],'little');self.mem[key(0)]=value;self.writes.append((key(0),value))
     out=struct.pack('<H',self.error)+data;response=b'\xd0\x00'+h[2:7]+struct.pack('<H',len(out))+out
     try:c.sendall(response[:5]);c.sendall(response[5:])
     except OSError:break
 def close(self):self.s.close()
class Tests(unittest.TestCase):
 def setUp(self):self.fake=MockPLC()
 def tearDown(self):self.fake.close()
 def test_3e_binary_bits_words_writes_and_fragmented_response(self):
  self.fake.mem.update(M1=1,M2=0,M3=1,D20=23107,D21=65535)
  c=SLMP('127.0.0.1',self.fake.port);c.open()
  self.assertEqual(c.read_bits('M1',3),[1,0,1]);self.assertEqual(c.read_words('D20',2),[23107,65535]);c.write_bit('M7201',1);c.write_word('D7200',32767);self.assertEqual(self.fake.mem['M7201'],1);self.assertEqual(self.fake.mem['D7200'],32767);c.close()
 def test_end_code_not_silently_accepted(self):
  c=SLMP('127.0.0.1',self.fake.port);c.open();self.fake.error=0xc051
  with self.assertRaisesRegex(RuntimeError,'C051'):c.read_words('D20',1)
  c.close()
 def test_connect_readonly_and_mailbox_interlock(self):
  b=server.Bridge();b.connect(dict(kind='slmp',host='127.0.0.1',port=self.fake.port));self.assertEqual(self.fake.writes,[])
  with self.assertRaises(RuntimeError):b.command('start')
  with self.assertRaises(RuntimeError):b.permit()
  self.fake.mem.update(D7190=23107,M7190=1);b.permit();b.armed=True;b.command('start');self.assertIn(('M7200',1),self.fake.writes)
  with self.assertRaises(ValueError):b.command('estop')
  self.fake.mem['M7190']=0
  with self.assertRaises(RuntimeError):b.command('reset')
  self.assertFalse(any(k.startswith(('X','Y')) for k,_ in self.fake.writes));b.disconnect()
 def test_gx_output_arm_rejected_before_mirror(self):
  b=server.Bridge();b.kind='gx';b.armed=True
  class Device:
   def read(self):return dict(M7000=1,M7001=1)
   def write(self,v):raise AssertionError('must not write')
  b.device=Device()
  with self.assertRaises(RuntimeError):b.mirror(dict(healthy=1))
 def test_http_token_origin_and_json_gate(self):
  http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);threading.Thread(target=http.serve_forever,daemon=True).start();url='http://127.0.0.1:'+str(http.server_port)
  try:
   self.assertEqual(urllib.request.urlopen(url+'/app.mjs').headers.get_content_type(),'text/javascript')
   with self.assertRaises(urllib.error.HTTPError) as ex:urllib.request.urlopen(url+'/api/state')
   self.assertEqual(ex.exception.code,403)
   req=urllib.request.Request(url+'/api/health',headers={'X-CapVision-Code':server.CODE,'Origin':'https://evil.invalid'})
   with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(req)
   req=urllib.request.Request(url+'/api/health',headers={'X-CapVision-Code':server.CODE});self.assertTrue(json.load(urllib.request.urlopen(req))['ok'])
  finally:http.shutdown();http.server_close()
if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(Tests);result=unittest.TextTestRunner(verbosity=2).run(suite)
 Path(__file__).with_name('Bridge_Test_Report.json').write_text(json.dumps(dict(method='Local mock SLMP TCP peer and HTTP security/permissions; no real PLC or MX Component',tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors)),indent=2),encoding='utf-8')
 sys.exit(not result.wasSuccessful())
