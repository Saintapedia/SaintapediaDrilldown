'use strict';

module.exports = function ( grunt ) {
	grunt.loadNpmTasks( 'grunt-banana-checker' );
	grunt.loadNpmTasks( 'grunt-eslint' );
	grunt.loadNpmTasks( 'grunt-jsonlint' );

	grunt.initConfig( {
		banana: {
			all: 'i18n/'
		},
		eslint: {
			options: { cache: true },
			all: [ 'modules/**/*.js', 'Gruntfile.js' ]
		},
		jsonlint: {
			all: [
				'*.json',
				'i18n/*.json',
				'!node_modules/**'
			]
		}
	} );

	// CSS linting runs via the stylelint CLI (npm run lint:css) rather than
	// grunt-stylelint, which peer-pins one exact stylelint major and needs
	// require(esm) support (Node >= 20.19.5) to load ESM stylelint.
	grunt.registerTask( 'test', [ 'eslint', 'banana', 'jsonlint' ] );
	grunt.registerTask( 'default', 'test' );
};
