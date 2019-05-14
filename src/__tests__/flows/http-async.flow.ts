import Flow from '@faasjs/flow-tencentcloud';

export default new Flow(
  {
    mode: 'async',
    triggers: {
      http: {
        path: '/async'
      },
    },
  },
  function () {
    return 1;
  },
);
