// react-native-maps ships no jest mock of its own, and its real native
// view components can't render in a JS-only test environment. Screens
// don't (currently) call any imperative ref methods (animateToRegion,
// etc.) — if a future screen test needs one, add it to the forwardRef
// stub below rather than reaching for the real native module.
const React = require("react");
const { View } = require("react-native");

function makeStub(name) {
  const Stub = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }));
  Stub.displayName = name;
  return Stub;
}

const MapView = makeStub("MapView");

module.exports = {
  __esModule: true,
  default: MapView,
  Marker: makeStub("Marker"),
  Circle: makeStub("Circle"),
  Polyline: makeStub("Polyline"),
  Callout: makeStub("Callout"),
  PROVIDER_GOOGLE: "google",
  PROVIDER_DEFAULT: "default",
};
