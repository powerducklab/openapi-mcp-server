import {it,expect} from 'vitest';
import {startAdminServer} from '../src/server/admin-server.js';
it('refuses unauthenticated public listeners before opening a socket',async()=>{
 for(const host of ['0.0.0.0','::','192.168.1.5']) await expect(startAdminServer({host,port:0,persistState:false})).rejects.toThrow(/API key/);
});
