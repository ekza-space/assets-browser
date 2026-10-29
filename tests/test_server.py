import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import make_server

class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();root=Path(self.temp.name)
        self.library=root/'library';self.library.mkdir()
        model=self.library/'avatars/test/one';model.mkdir(parents=True)
        (model/'model.vrm').write_bytes(b'glTF1234567890')
        items=[dict(id='one',collection_id='test',collection_name='Test',name='<Avatar>',author='Artist',license='CC-BY',local_dir='avatars/test/one'),dict(id='two',collection_id='test',collection_name='Test',name='Remote',author='Other',license='CC0',local_dir='avatars/test/two')]
        (self.library/'manifest.json').write_text(json.dumps({'avatars':items}))
        self.server=make_server(self.library,root/'data',0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()
    def request(self,method,path,body=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        conn.request(method,path,body,headers or {});response=conn.getresponse();data=response.read();status=response.status;h=dict(response.getheaders());conn.close();return status,data,h
    def post(self,path,data):return self.request('POST',path,json.dumps(data),{'Content-Type':'application/json'})
    def test_catalog_and_local_media(self):
        status,body,_=self.request('GET','/api/catalog');self.assertEqual(status,200)
        data=json.loads(body);self.assertTrue(data['items'][0]['local']);self.assertFalse(data['items'][1]['local'])
        self.assertEqual(data['items'][0]['author'],'Artist')
        url=data['items'][0]['model'];status,body,headers=self.request('GET',url,headers={'Range':'bytes=0-3'})
        self.assertEqual((status,body),(206,b'glTF'));self.assertEqual(headers['Content-Range'],'bytes 0-3/14')
        self.assertEqual(self.request('GET',url,headers={'Range':'bytes=999-1000'})[0],416)
        self.assertEqual(self.request('GET',url,headers={'Range':'bytes=-4'})[1],b'7890')
    def test_durable_partial_reviews_and_export(self):
        self.assertEqual(self.post('/api/reviews/test%3Aone',{'rating':5})[0],200)
        self.assertEqual(self.post('/api/reviews/test%3Aone',{'liked':True})[0],200)
        exported=json.loads(self.request('GET','/api/reviews/export')[1]);self.assertEqual(exported['reviews']['test:one']['rating'],5)
        self.assertTrue(exported['reviews']['test:one']['liked']);self.assertEqual(exported['credits'][0]['author'],'Artist')
        # Fresh server / fresh connection to the same database.
        restarted=make_server(self.library,self.server.catalog.data,0)
        self.assertEqual(restarted.catalog.reviews()['test:one']['rating'],5);restarted.server_close()
        self.post('/api/reviews/test%3Aone',{'rating':0});self.assertTrue(self.server.catalog.reviews()['test:one']['liked'])
    def test_invalid_reviews(self):
        for patch in [{'rating':-1},{'rating':6},{'rating':True},{'rating':2.5},{'liked':'yes'},{'extra':2},[],{}]:
            self.assertEqual(self.post('/api/reviews/test%3Aone',patch)[0],400)
        self.assertEqual(self.post('/api/reviews/unknown',{'rating':5})[0],400)
    def test_origin_and_path_guards(self):
        self.assertEqual(self.request('POST','/api/reviews/test%3Aone','{"rating":5}',{'Content-Type':'application/json','Origin':'https://example.com'})[0],403)
        self.assertEqual(self.request('GET','/api/catalog',headers={'Host':'evil.example'})[0],403)
        for path in ['/media/../../../manifest.json','/vendor/three/build/../../../../server.py','/%2e%2e/server.py','/renders/../../server.py']:
            self.assertIn(self.request('GET',path)[0],(403,404))
    def test_render_cache(self):
        token=self.server.catalog.items[0]['token'];png=b'\x89PNG\r\n\x1a\nTEST'
        self.assertEqual(self.request('POST',f'/api/renders/{token}',png,{'Content-Type':'image/png'})[0],200)
        self.assertEqual(self.request('GET',f'/renders/{token}.png')[1],png)
        self.assertEqual(self.server.catalog.items[0]['render'],f'/renders/{token}.png')
        self.assertEqual(self.request('POST',f'/api/renders/{token}',b'no',{'Content-Type':'image/png'})[0],400)

if __name__=='__main__':unittest.main()
