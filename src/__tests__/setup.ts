jest.mock(process.cwd() + '/node_modules/cos-nodejs-sdk-v5', () => {
  return class Client {
    sliceUploadFile (params, callback) {
      callback();
    }
  };
});

jest.mock(process.cwd() + '/node_modules/@faasjs/provider-tencentcloud-scf', () => {
  return {
    action: async function () {
      return {
        Code: 0
      };
    },
    deploy: async function () {
      return true;
    }
  };
});

jest.mock(process.cwd() + '/node_modules/@faasjs/provider-tencentcloud-apigateway', () => {
  return {
    action: async function () {
      return {
        Code: 0
      };
    },
    deploy: async function () {
      return true;
    }
  };
});
