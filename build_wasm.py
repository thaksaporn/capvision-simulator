"""Rebuild browser C core using an installed Zig compiler (tested 0.16.0)."""
from pathlib import Path
import argparse,subprocess
p=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--zig',default='zig');args=parser.parse_args()
exports=['init','hello','heartbeat','reset','tick','result','event','event_get','get']
subprocess.run([args.zig,'cc','-target','wasm32-wasi','-O2','-mexec-model=reactor',str(p/'bridge/control.c'),str(p/'bridge/web_api.c')]+['-Wl,--export=web_'+n for n in exports]+['-o',str(p/'dist/assets/engine.wasm')],check=True)
