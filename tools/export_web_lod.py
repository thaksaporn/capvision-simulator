import bpy,json
from pathlib import Path
root=Path.cwd()/'outputs/CapVision_Web_Simulator';assets=root/'dist/assets'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(assets/'machine.glb'))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
cab=next(o for o in objects if o.name=='Cabinet')
bpy.ops.object.select_all(action='DESELECT');cab.select_set(True);bpy.context.view_layer.objects.active=cab
bpy.ops.export_scene.gltf(filepath=str(assets/'cabinet_detail.glb'),use_selection=True,export_animations=False,export_yup=True)
for o in objects:
 ratio=.12 if o.name=='Cabinet' else .9 if o.name=='Machine' else 1
 if ratio<1:
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
  mod=o.modifiers.new('Overview web LOD','DECIMATE');mod.ratio=ratio;bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(assets/'machine_light.glb'),use_selection=True,export_animations=False,export_yup=True)
print('LOD exported; original full-resolution GLB unchanged',flush=True)
