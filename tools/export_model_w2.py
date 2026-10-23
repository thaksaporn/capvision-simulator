import bpy,json
from pathlib import Path
from mathutils import Vector
p=Path.cwd();bpy.ops.wm.open_mainfile(filepath=str(p/'outputs/CapVision_Realistic_C3_Editable_Parts.blend'));s=bpy.context.scene;s.frame_set(1)
items=[];removed=[]
def external(o):
 points=[o.matrix_world@Vector(c) for c in o.bound_box]
 return any(v.x < -3.5 or v.x > -1.82 or v.y < .55 or v.y > 1.8 or v.z < .05 or v.z > 1.25 for v in points)

for o in list(s.objects):
 if o.type not in {'MESH','CURVE','FONT'} or o.hide_render or o.name.startswith(('B1 CAP','B1 RECEIVING','B1 air stream','B1 monitor','Can end ','Upright receiving cap','Cap preview','Studio floor')):continue
 if (o.name.startswith(('A2 WIRE','A2 wire marker')) and external(o)) or o.name.startswith(('Inspection PC heading','Inspection PC result','Inspection PC status','Inspection PC PASS','Inspection PC active display','PC pass status','PC counts','PC footer')):
  removed.append(o.name);continue
 if o.name in ('M1 motor cable','E1 shielded cable','Camera ethernet cable','Monitor data and power','M2 motor cable'):
  removed.append(o.name);continue
 if o.type=='CURVE':o.data.resolution_u=min(o.data.resolution_u,6);o.data.bevel_resolution=min(o.data.bevel_resolution,2)
 o.animation_data_clear();o.hide_set(False);items.append(o)
def route(name,points):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=.005;curve.bevel_resolution=2
 spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
 for point,co in zip(spline.points,points):point.co=(*co,1)
 obj=bpy.data.objects.new(name,curve);s.collection.objects.link(obj);curve.materials.append(bpy.data.materials['Black polymer and rubber']);items.append(obj)
route('W2 camera cable to rear tray',[(-.45,.13,1.32),(-.52,.20,1.38),(-.58,.24,1.2),(-.58,.24,.76),(-.7,.24,.72)])
route('W2 PC data cable secured to stand',[(.1,-.22,1.43),(.18,-.18,1.36),(.18,.18,1.36),(.18,.24,.75),(.1,.24,.72)])
route('W2 main drive cable drop',[(1.12,.2,.82),(1.15,.24,.73),(.95,.24,.72)])
route('W2 encoder cable secured to bearing',[(1.19,.12,.87),(1.23,.22,.83),(1.16,.24,.72)])
route('W2 receiving motor cable',[(2.65,.18,.4),(2.68,.24,.33),(2.48,.24,.31)])
bpy.ops.object.select_all(action='DESELECT')
for o in items:o.select_set(True)
bpy.context.view_layer.objects.active=items[0];bpy.ops.object.convert(target='MESH')
# Join static pieces into a few named groups to reduce web draw overhead.
converted=list(bpy.context.selected_objects)
hood=lambda n:n.startswith(('Front service door','Machine title','Machine subtitle','Machine code','Door recessed','Door quarter'))
def category(o):
 n=o.name
 if n.startswith('A2 '):return 'Cabinet'
 if n.startswith(('Y2 pusher paddle','Y2 guide rod')):return 'Pusher'
 if hood(n):return 'Hood'
 if n=='CV1 top belt':return 'MainBelt'
 if n=='CV2 top belt':return 'ReceivingBelt'
 if n in ('CV1 end roller.001','CV1 roller shaft.001'):return 'MainRoller'
 if n in ('CV2 end roller.001','CV2 roller shaft.001'):return 'TailRoller'
 return 'Machine'
groups={}
for o in converted:groups.setdefault(category(o),[]).append(o)
for name,group in groups.items():
 if not group:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in group:o.select_set(True)
 bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();bpy.context.object.name=name
 if name!='Pusher':
  mod=bpy.context.object.modifiers.new('Web polygon optimization','DECIMATE');mod.ratio=.55;bpy.ops.object.modifier_apply(modifier=mod.name)
 if name in ('MainRoller','TailRoller'):
  s.cursor.location=(1.19,0,.87) if name=='MainRoller' else (2.75,0,.42)
  bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.ops.object.select_all(action='DESELECT')
for o in s.objects:
 if o.name in groups:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(p/'outputs/CapVision_Web_Simulator/dist/assets/machine.glb'),use_selection=True,export_animations=False,export_materials='EXPORT',export_yup=True,export_extras=True)
(p/'work/websim/W2_removed_visuals.json').write_text(json.dumps(removed,indent=2),encoding='utf-8')
print('EXPORTED W2',len(removed),'exposed diagram wires/markers removed; original Blender unchanged',flush=True)
