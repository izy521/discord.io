/* ISC License (hsl-to-hex by davidmarkclements)
THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/
var Discord = require('discord.io');

var hsl = require('hsl-to-hex');

var serverid = ""; /* Your Discord server id */

var bot = new Discord.Client({
    autorun: true,
    token: "" /* your DiscordApp token */
});

var hue = 0; /* Hue is a degree on the color wheel from 0 to 360. 0 is red, 120 is green, 240 is blue. */
var sat = 100; /* Saturation is a percentage value; 0% means a shade of gray and 100% is the full color. */
var lum = 50; /* Lightness is also a percentage; 0% is black, 100% is white. */
var crole = ''; /* Id of the role that should have "chroma" effect */

bot.on('ready', function() {
    console.log("Successfully connected: " + bot.username + " - (" + bot.id + ")");
});

setInterval(function() {
    if (hue != 360) hue += 2;
    else hue = 0;
}, 250);
setInterval(function() {
    bot.editRole({
        serverID: serverid,
        roleID: crole,
        color: hsl(hue, sat, lum)
    });
}, 500);
