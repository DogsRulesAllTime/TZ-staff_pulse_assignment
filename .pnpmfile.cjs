/**
 * pnpmfile hook: typescript-eslint 8.x cannot run on the project's TS 7.0
 * (tsgo) API, so we resolve the `typescript` dependency of the lint toolchain
 * to the side-by-side TS 6.x line while the rest of the repo keeps TS 7.
 * See https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0
 * (README, раздел «Разработка: линт и формат», упоминает этот TS 6 side-by-side.)
 */
module.exports = {
  hooks: {
    readPackage(pkg) {
      const isTsEslint =
        pkg.name === 'typescript-eslint' || pkg.name.startsWith('@typescript-eslint/');
      if (isTsEslint) {
        // Peer on `typescript` resolves to the root TS 7; replace it with a
        // hard dep on the side-by-side TS 6 line that the plugin can run on.
        const { typescript: _ts, ...peers } = pkg.peerDependencies || {};
        pkg.peerDependencies = peers;
        pkg.dependencies = {
          ...pkg.dependencies,
          typescript: '6.0.3',
        };
      }
      return pkg;
    },
  },
};
