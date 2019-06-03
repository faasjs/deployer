import { Deployer } from '../index';
import { execSync } from 'child_process';

test('http', async function () {
  const deployer = new Deployer({
    root: process.cwd() + '/src/__tests__',
    filename: __dirname + '/funcs/http.func.ts',
    env: 'testing'
  });
  const info = await deployer.deploy();

  const res = execSync(`node -e "const handler = require('${info.tmp}index.js').handler;(async function invoke(){console.log('|'+JSON.stringify(await handler({body:'0'}))+'|');})(handler);"`, {
    cwd: info.tmp
  }).toString();

  expect(res.match(/([^|]+)|$/g)[1]).toEqual('{"body":"{\\"data\\":0}","statusCode":200}');
}, 10000);
