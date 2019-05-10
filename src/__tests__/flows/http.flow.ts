import Flow from '@faasjs/flow-tencentcloud';

export default new Flow(
  {
    triggers: {
      http: {},
    },
  },
  function () {
    return 1;
  },
);
