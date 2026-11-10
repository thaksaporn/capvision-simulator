"""Bench test without hardware: a mock FX5U answering SLMP 3E binary on 127.0.0.1.
It pretends ladder W1/W2/W3 is installed, hardware is armed and remote enable (M7190) is ON.
- prints every reject request the bridge writes (M7230 = A -> Y15 lamp, M7231 = B -> Y16 lamp)
- emulates the W3 training-kit latch: type  x0  + Enter = press START (lamp Y5),
  x1  + Enter = press STOP (lamp Y6); web START/STOP requests (M7236 / M7237) drive the same latch

Usage: python tools/mock_fx5u.py   (then connect the web in the hybrid / training-kit mode to 127.0.0.1 and the printed port)
"""
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tests_bridge import MockPLC  # noqa: E402

plc = MockPLC()
plc.mem.update(D7190=23107, M7190=1, M7000=0, M7001=1, D20=10, M7238=1, M7235=0, Y5=0, Y6=1)
print('MOCK FX5U SLMP port', plc.port, '| type x0 = START, x1 = STOP', flush=True)
lamps = None


def set_run(on, why):
    plc.mem['M7235'] = int(on)
    plc.mem['Y5'], plc.mem['Y6'] = int(on), int(not on)
    print(time.strftime('%H:%M:%S'), why, '->', 'Y5 RUN' if on else 'Y6 STOP', flush=True)


def buttons():
    for line in sys.stdin:
        key = line.strip().lower()
        if key == 'x0' and not plc.mem['M7235']:
            set_run(True, 'X0 START pressed')
        elif key == 'x1':
            set_run(False, 'X1 STOP pressed')


threading.Thread(target=buttons, daemon=True).start()
seen = 0
while True:
    time.sleep(0.05)
    while seen < len(plc.writes):
        dev, val = plc.writes[seen]
        seen += 1
        if not val:
            continue
        if dev in ('M7230', 'M7231'):
            print(time.strftime('%H:%M:%S'), 'REJECT', 'A -> Y15' if dev == 'M7230' else 'B -> Y16', flush=True)
        elif dev == 'M7236' and not plc.mem['M7235']:
            set_run(True, 'web START request (M7236)')
        elif dev == 'M7237' and plc.mem['M7235']:
            set_run(False, 'web STOP request (M7237)')
        if dev in ('M7230', 'M7231', 'M7236', 'M7237'):
            plc.mem[dev] = 0          # ladder clears request bits at end of scan
