import Flow from '@faasjs/flow-tencentcloud';

export default new Flow(
  {
    mode: 'async',
    triggers: {
      http: {},
    },
  },
  function () {
    return 1;
  },
);
