import Deploy from '../index';

describe('http-async', function () {
  test('constructor', function () {
    const deploy = new Deploy(process.cwd() + '/src/__tests__', __dirname + '/flows/http-async.flow.ts');

    expect(deploy.file).toEqual(__dirname + '/flows/http-async.flow.ts');
  });

  test('build', async function () {
    const deploy = new Deploy(process.cwd() + '/src/__tests__', __dirname + '/flows/http-async.flow.ts');
    const info = await deploy.build();

    expect(deploy.name).toEqual('http-async');
    expect(info.functions).toHaveLength(2);
    expect(info.triggers).toHaveLength(1);
  }, 100000);

  test('deploy', async function () {
    const deploy = new Deploy(process.cwd() + '/src/__tests__', __dirname + '/flows/http-async.flow.ts');
    const info = await deploy.build();
    const res = await deploy.deploy(info);

    expect(res).toBeTruthy();
  }, 100000);
});
