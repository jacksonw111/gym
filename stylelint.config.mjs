export default {
  extends: ['stylelint-config-standard-less'],
  ignoreFiles: ['node_modules/**', 'miniprogram/miniprogram_npm/**'],
  rules: {
    'custom-property-pattern': null,
    'property-no-vendor-prefix': null,
    'selector-class-pattern': null,
    'selector-type-no-unknown': [true, { ignoreTypes: ['page', 'scroll-view'] }],
    'unit-no-unknown': [true, { ignoreUnits: ['rpx'] }],
    'value-no-vendor-prefix': null,
  },
}
