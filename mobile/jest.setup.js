const { cleanup } = require("@testing-library/react-native");

// Without this, a screen rendered in one test stays mounted into the
// next one — the previous LoginScreen tests all failed to find elements
// (or overlapping-act() console errors) because two copies of the screen
// were mounted simultaneously by the time the second test ran.
afterEach(cleanup);

// Official mock — every screen using useSafeAreaInsets() would otherwise
// throw "No safe area value available" without a real <SafeAreaProvider>
// measuring real device insets, which doesn't exist in a JS test env.
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default
);
