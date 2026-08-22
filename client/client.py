# Minimal Windows client skeleton. Install websocket-client and requests.
# The production EXE should download the job, send it to the configured Windows printer,
# then report printed/cancelled/error to the server.
import json, time, os, subprocess
import requests
from websocket import create_connection

with open('client_config.json','r',encoding='utf-8') as f: cfg=json.load(f)
server=cfg['server'].rstrip('/'); cid=cfg['client_id']; token=cfg['token']
ws_url=server.replace('https://','wss://').replace('http://','ws://')+'/ws'
ws=create_connection(ws_url, timeout=30)
ws.send(json.dumps({'type':'hello','client_id':cid,'token':token}))
print('Connected:', ws.recv())
while True:
    try:
        msg=json.loads(ws.recv());
        if msg.get('type')!='job': continue
        job=msg['job']; local=os.path.join(os.getenv('TEMP','.'),job['filename'])
        r=requests.get(job['download'],timeout=120); r.raise_for_status(); open(local,'wb').write(r.content)
        # Replace this line with the actual Windows printing implementation.
        # os.startfile(local, 'print')
        ws.send(json.dumps({'type':'status','job_id':job['id'],'status':'printed'}))
        print('Job ready:',local)
    except Exception as e:
        print('Client error:',e); time.sleep(3)
