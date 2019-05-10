import Flow from '@faasjs/flow-tencentcloud';

export default new Flow(
  {},
  function (prev: any) {
    return prev + 1;
  },
  function (prev: any) {
    return prev + 2;
  },
);
