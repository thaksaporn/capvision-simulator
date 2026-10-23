"""Mitsubishi documented SLMP 3E binary TCP. No remote RUN/STOP CPU command.
Word reads and bit-device reads/writes only; callers enforce device allowlists.
"""
import socket,struct,threading
class SLMP:
 def __init__(self,host,port,timeout=1):self.host=host;self.port=port;self.timeout=timeout;self.lock=threading.Lock();self.sock=None
 def open(self):self.sock=socket.create_connection((self.host,self.port),self.timeout);self.sock.settimeout(self.timeout)
 def close(self):
  if self.sock:
   try:self.sock.close()
   finally:self.sock=None
 def exact(self,n):
  b=bytearray()
  while len(b)<n:
   x=self.sock.recv(n-len(b))
   if not x:raise ConnectionError('PLC closed connection')
   b.extend(x)
  return bytes(b)
 def exchange(self,cmd,sub,payload):
  with self.lock:
   if not self.sock:raise ConnectionError('PLC not connected')
   body=struct.pack('<HHH',16,cmd,sub)+payload
   self.sock.sendall(b'\x50\x00'+struct.pack('<BBHBH',0,255,0x03ff,0,len(body))+body)
   header=self.exact(9)
   if header[:2]!=b'\xd0\x00':raise ValueError('Not an SLMP 3E binary response')
   if header[2:7]!=b'\x00\xff\xff\x03\x00':raise ValueError('Unexpected SLMP route')
   size=int.from_bytes(header[7:9],'little')
   if not 2<=size<=8192:raise ValueError('Invalid SLMP response length')
   data=self.exact(size);end=int.from_bytes(data[:2],'little')
   if end:raise RuntimeError('PLC SLMP end code 0x%04X'%end)
   return data[2:]
 def device(self,name,count):
  code={'M':0x90,'D':0xa8,'X':0x9c,'Y':0x9d}[name[0]]
  number=int(name[1:],8 if name[0] in 'XY' else 10)
  if not 1<=count<=960:raise ValueError('device count')
  return number.to_bytes(3,'little')+bytes([code])+struct.pack('<H',count)
 def read_bits(self,name,count):
  data=self.exchange(0x0401,1,self.device(name,count))
  if len(data)!=(count+1)//2:raise ValueError('SLMP bit response size')
  vals=[(data[i//2]>>(4 if i%2==0 else 0))&15 for i in range(count)]
  if any(x not in (0,1) for x in vals):raise ValueError('Invalid SLMP bit encoding')
  return vals
 def read_words(self,name,count):
  data=self.exchange(0x0401,0,self.device(name,count))
  if len(data)!=count*2:raise ValueError('SLMP word response size')
  return list(struct.unpack('<'+'H'*count,data))
 def write_bit(self,name,value):
  if self.exchange(0x1401,1,self.device(name,1)+bytes([0x10 if value else 0])):raise ValueError('Unexpected write response')
 def write_word(self,name,value):
  if self.exchange(0x1401,0,self.device(name,1)+struct.pack('<H',value&65535)):raise ValueError('Unexpected write response')
