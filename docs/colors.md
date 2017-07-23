There are two ways to set role colors with this lib.

The first method allows you to provide any color you want, as a Number. I recommend using Hex numbers as this maps easily to HTML color codes. Assuming you want to use the color `#F35353`, you can just use `0xF35353`

```js
bot.editRole({
	color: 0xF35353
});
```

The second method is providing the name of one of the official colors Discord has on its picker. The name you type will map to one of the colors below.
```javascript
bot.editRole({
	color: "RED"
});
```

Official color list:
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
