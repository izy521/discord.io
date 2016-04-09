Example for using colors:

```javascript
bot.editRole({
	server: "ServerID",
	role: "RoleID",
	color: "RED"
});
```

Official color list (just type their names):

```javascript
	DEFAULT: 0,
	AQUA: 1752220,
	GREEN: 3066993,
	BLUE: 3447003,
	PURPLE: 10181046,
	GOLD: 15844367,
	ORANGE: 15105570,
	RED: 15158332,
	GREY: 9807270,
	DARKER_GREY: 8359053,
	NAVY: 3426654,
	DARK_AQUA: 1146986,
	DARK_GREEN: 2067276,
	DARK_BLUE: 2123412,
	DARK_PURPLE: 7419530,
	DARK_GOLD: 12745742,
	DARK_ORANGE: 11027200,
	DARK_RED: 10038562,
	DARK_GREY: 9936031,
	LIGHT_GREY: 12370112,
	DARK_NAVY: 2899536
```

Unofficially, until it's later patched, you can use any HTML color code.
```javascript
bot.editRole({
	color: "#FF00FF" //Will make a pink role
});
```
