# 32-bit Windows PowerShell COM adapter. MX Component is supplied/licensed by Mitsubishi.
# Persistent process keeps COM calls on the same STA thread. JSON lines only.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$controller=$null
while ($null -ne ($line=[Console]::In.ReadLine())) {
 try {
  $request=$line | ConvertFrom-Json
  switch ($request.op) {
   'open' {
    if($null -ne $controller){$null=$controller.Close()}
    $controller=New-Object -ComObject 'ActUtlType.ActUtlType'
    $controller.ActLogicalStationNumber=[int]$request.station
    $code=$controller.Open()
    if($code -ne 0){throw ('MX Open failed: 0x{0:X8}' -f $code)}
    @{ok=$true} | ConvertTo-Json -Compress
   }
   'read' {
    $values=@{}
    foreach($device in $request.devices){
     [int]$value=0;$code=$controller.GetDevice([string]$device,[ref]$value)
     if($code -ne 0){throw ('MX read '+$device+': 0x{0:X8}' -f $code)}
     $values[[string]$device]=$value
    }
    @{values=$values}|ConvertTo-Json -Compress
   }
   'write' {
    foreach($entry in $request.values.PSObject.Properties){
     $code=$controller.SetDevice([string]$entry.Name,[int]$entry.Value)
     if($code -ne 0){throw ('MX write '+$entry.Name+': 0x{0:X8}' -f $code)}
    }
    @{ok=$true}|ConvertTo-Json -Compress
   }
   'close' {if($null -ne $controller){$null=$controller.Close();$controller=$null};@{ok=$true}|ConvertTo-Json -Compress}
   default {throw 'Unknown operation'}
  }
 }catch{@{error=$_.Exception.Message}|ConvertTo-Json -Compress}
}
if($null -ne $controller){$null=$controller.Close()}
