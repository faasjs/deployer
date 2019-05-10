jest.mock(process.cwd() + '/node_modules/cos-nodejs-sdk-v5', () => {
  return class Client {
    sliceUploadFile (params, callback) {
      callback();
    }
  };
});

jest.mock(process.cwd() + '/node_modules/@faasjs/request', () => {
  return async function (url) {
    switch (url) {
      case 'https://apigateway.api.qcloud.com/v2/index.php?':
        return {
          body: '{"apiIdStatusSet":[{"apiId":"apiId","path":"/"}]}'
        };
      case 'https://scf.tencentcloudapi.com/?':
        return {
          body: '{"Response":{}}'
        };
    }
  };
});
