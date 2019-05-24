import Deploy from '../index';

describe('multi', function () {
  test('constructor', function () {
    const deploy = new Deploy(process.cwd() + '/src/__tests__', __dirname + '/flows/multi.flow.ts');

    expect(deploy.file).toEqual(__dirname + '/flows/multi.flow.ts');
  });

  test('build', async function () {
    const deploy = new Deploy(process.cwd() + '/src/__tests__', __dirname + '/flows/multi.flow.ts');
    const info = await deploy.build();

    expect(deploy.name).toEqual('multi');
    expect(info.functions).toHaveLength(2);
  }, 100000);

  test('deploy', async function () {
    const deploy = new Deploy(process.cwd() + '/src/__tests__', __dirname + '/flows/multi.flow.ts');
    const info = await deploy.build();
    const res = await deploy.deploy(info);

    expect(res).toBeTruthy();
  }, 100000);
});
