"""Regenerate the W1 ladder JSON (used by tests) and the GX Works3 CSV import file
from the instruction-list sources in PROGRAMS (CapVision W1 and the training kit).

Usage: python tools/build_ladder.py [--check]
  --check  only compare with the files on disk, write nothing (exit 1 on difference)
"""
import json
import sys
from pathlib import Path

PLC = Path(__file__).resolve().parent.parent / 'PLC'
COLS = 'Step No.\tLine Statement\tInstruction\tI/O (Device)\tBlank\tPI Statement\tNote'
# (instruction list, test JSON, GX Works3 CSV, program title)
PROGRAMS = [
    (PLC / 'CapVision_W1_Instruction_List.txt', PLC / 'W1_instruction_code.json',
     PLC / 'CapVision_W1_Ladder_IMPORT.csv', 'CapVision PLC B2 board supervisor'),
    (PLC / 'TrainingKit' / 'TK_Motor_Encoder_Instruction_List.txt', PLC / 'TrainingKit' / 'TK_instruction_code.json',
     PLC / 'TrainingKit' / 'TK_Motor_Encoder_IMPORT.csv', 'Training kit motor START-STOP + study encoder'),
]


def parse(text):
    rows = []                              # ('title', text) | ('ins', op, [operands])
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith(';'):
            rows.append(('title', line[1:].strip()))
            continue
        parts = line.split()
        rows.append(('ins', parts[0], parts[1:]))
    return rows


def build(rows, title):
    code = [[r[1], r[2]] for r in rows if r[0] == 'ins']
    js = json.dumps(code, ensure_ascii=False)
    csv, step = [title, 'Module Type Information:\tFX5CPU FX5U', COLS], 0
    for r in rows:
        if r[0] == 'title':
            csv.append('\t' + r[1] + '\t\t\t\t\t')
        else:
            csv.append('%d\t\t%s\t%s\t\t\t' % (step, r[1], ' '.join(r[2])))
            step += 1
    return js, '\r\n'.join(csv) + '\r\n'


def main():
    ok = True
    for src, json_out, csv_out, title in PROGRAMS:
        js, csv = build(parse(src.read_text(encoding='utf-8')), title)
        if '--check' in sys.argv:
            same_js = json_out.exists() and json_out.read_text(encoding='utf-8') == js
            same_csv = csv_out.exists() and csv_out.read_bytes().decode('utf-16') == csv
            print(src.name, '| json identical:', same_js, '| csv identical:', same_csv)
            ok = ok and same_js and same_csv
            continue
        json_out.write_text(js, encoding='utf-8')
        csv_out.write_bytes(csv.encode('utf-16'))    # UTF-16 LE with BOM, as GX Works3 exports
        print('wrote', json_out.name, 'and', csv_out.name, '-', len(json.loads(js)), 'instructions')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
