Steps to integrate LiveSmart WP plugin:

1. Installation

- Make sure you have LiveSmart Video Chat installed. 
If you do not have it, please visit https://codecanyon.net/item/livesmart-server-video/47633218
Installation details can be found here https://livesmart.video/installation-sfu
- Add the file livesmart-plugin.php to wp-content/plugins folder. The plug-in will appear in the WordPress admin panel under Plugins section. Other option is to upload the included zip file from the Plugins menu.
- Activate the plug-in.

2. Setup

After the activation, a new link appears in the left menu - LiveSmart Settings.

- Server URL - fill in your server URL.

3. LiveSmart Dashboard

- After you set the correct settings and your DB is set and installed, you can visit LiveSmart Dashboard in the menu. 

4. WordPress site integration

The plugin registers two shortcodes - livesmart_widget_button and livesmart_widget_page. 

- First one adds presence button to your WP page and visitors of the site can contact logged in agent. More information about presence button functionality can be found here - https://livesmart.video/userguide-sfu/#statusbutton
Place the tag [livesmart_widget_button] where you want the button to appear. There are optional parameters that can be added - name (name of the agent), tenant (tenant in which the agents are grouped), message (text to appear on the button, defauilt is Start New Meeting), css (button appearance, all buttons are described in the documentation page), iframeid (if you need the button page to be added in a specific iframe, put here the ID of the frame). All parameters are optional;

- Integrating LiveSmart meeting page into a WP single page, i.e. a streaming session:
From the Pages section, edit the content of the page and place the tag [livesmart_widget_page name="NAME_OF_THE_MEETING"]
