import { defineComponent, h } from 'vue';

export default defineComponent({
  name: 'UiSelect',
  setup(_props, { attrs, slots }) {
    return () => h('select', attrs, slots.default?.());
  },
});
