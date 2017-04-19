/**
 * Retrieve a user object from Discord, Bot only endpoint. You don't have to share a server with this user.
 * @arg {Object} input
 * @arg {Snowflake} input.userID
 */
DCP.getUser = function (input) {
	if (!this.bot) return Promise.reject("Only bots can use this endpoint");
	this._req('get', Endpoints.USER(input.userID), function(err, res) {
		handleResCB("Could not get user", err, res, callback);
	});
};

//Change below
/**
	 * Edit the client's user information.
	 * @arg {Object} input
	 * @arg {String<Base64>} input.avatar - The last part of a Base64 Data URI. `fs.readFileSync('image.jpg', 'base64')` is enough.
	 * @arg {String} input.username - A username.
	 * @arg {String} input.email - [User only] An email.
	 * @arg {String} input.password - [User only] Your current password.
	 * @arg {String} input.new_password - [User only] A new password.
	 */
	editUserInfo(input) {
		var payload = {
			avatar: this.avatar,
			email: this.email,
			new_password: null,
			password: null,
			username: this.username
		}, plKeys = Object.keys(payload);

		Object.keys(input).forEach(function (key) {
			if (key === 'avatar') return void(payload.avatar = "data:image/jpg;base64," + input.avatar);
			if (plKeys.indexOf(key) > -1) payload[key] = input[key];
		});

		this._req('patch', Endpoints.ME, payload, function(err, res) {
			handleResCB("Unable to edit user information", err, res, callback);
		});
	};