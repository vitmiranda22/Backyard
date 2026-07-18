// Shared mock for every screen test — returns the translation key itself
// rather than real translated text. Screen tests should assert on UI
// behavior (what renders, what happens on press), not on exact copy from
// locales/en.json — that would make tests break every time copy changes
// for reasons unrelated to the logic being tested.
function fakeT(key, options) {
  if (options && typeof options === "object") {
    return `${key} ${JSON.stringify(options)}`;
  }
  return key;
}

module.exports = {
  useTranslation: () => ({
    t: fakeT,
    i18n: { changeLanguage: jest.fn(), language: "en" },
  }),
  // Class components can't use the useTranslation hook -- withTranslation
  // is the HOC equivalent, currently only needed by ErrorBoundary.
  withTranslation: () => (Component) => (props) =>
    require("react").createElement(Component, {
      ...props,
      t: fakeT,
      i18n: { changeLanguage: jest.fn(), language: "en" },
    }),
  initReactI18next: { type: "3rdParty", init: jest.fn() },
};
