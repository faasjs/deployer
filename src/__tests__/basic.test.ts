import Deploy from '../index';

describe('basic', function () {
  test('constructor', function () {
    const deploy = new Deploy(process.cwd(), __dirname + '/flows/basic.flow.ts');

    expect(deploy.file).toEqual(__dirname + '/flows/basic.flow.ts');
    expect(deploy.name).toEqual('basic');
  });

  test('build', async function () {
    const deploy = new Deploy(process.cwd(), __dirname + '/flows/basic.flow.ts');
    const info = await deploy.build();

    const handler = require(info.functions[0].tmpFolder + '/index.js').handler;
    const res = await handler(0, {});

    expect(info.functions).toHaveLength(1);
    expect(res).toEqual(3);
  }, 10000);

  test('deploy', async function () {
    const deploy = new Deploy(process.cwd(), __dirname + '/flows/basic.flow.ts');
    const info = await deploy.build();
    const res = await deploy.deploy(info);

    expect(res).toBeTruthy();
  }, 10000);
});
