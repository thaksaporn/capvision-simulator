"""Bench test without hardware: a mock FX5U answering SLMP 3E binary on 127.0.0.1.
It pretends ladder W1/W2 is installed and remote enable (M7190) is ON, and prints every
reject request the bridge writes (M7230 = A -> Y1, M7231 = B -> Y2).

Usage: python tools/mock_fx5u.py     (then connect the web in mode "hybrid" to 127.0.0.1 and the printed port)
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tests_bridge import MockPLC  # noqa: E402

plc = MockPLC()
plc.mem.update(D7190=23107, M7190=1, M7000=0, M7001=1, D20=10)
print('MOCK FX5U SLMP port', plc.port, flush=True)
seen = 0
while True:
    time.sleep(0.05)
    while seen < len(plc.writes):
        dev, val = plc.writes[seen]
        seen += 1
        if dev in ('M7230', 'M7231') and val:
            print(time.strftime('%H:%M:%S'), 'REJECT', 'A -> Y1' if dev == 'M7230' else 'B -> Y2', flush=True)
            plc.mem[dev] = 0          # ladder clears the request bit at end of scan
