<?php

/*
 * ==========================================================
 * FUNCTIONS_USERS.PHP
 * ==========================================================
 *
 * Users functions file. © 2017-2023 board.support. All rights reserved.
 *
 * -----------------------------------------------------------
 * LOGIN AND ACCOUNT
 * -----------------------------------------------------------
 *
 * 1. Check if the login details are corrects and if yes set the login
 * 2. Update details of the login cookie
 * 3. Logout a user
 * 4. Return the logged in user information
 * 5. Set the login cookie
 * 6. Get the login cookie
 * 7. Verify the login password
 * 8. Check the the active user is an admin, bot, or agent
 * 9. Return the department of the active agent
 * 10. Check the the active user it the supervisor
 * 11. Envato purchase code validation
 *
 */

function sb_login($email = '', $password = '', $user_id = '', $user_token = '') {
    global $SB_LOGIN;
    $valid_login = false;
    $result = null;
    $query = 'SELECT id, profile_image, first_name, last_name, email, password, user_type, token, department FROM sb_users ';
    $ip = isset($_SERVER['HTTP_CF_CONNECTING_IP']) && substr_count($_SERVER['HTTP_CF_CONNECTING_IP'], '.') == 3 ? $_SERVER['HTTP_CF_CONNECTING_IP'] : $_SERVER['REMOTE_ADDR'];
    $ips = sb_get_external_setting('ip-ban', []);
    if (isset($ips[$ip]) && $ips[$ip][0] > 10) {
        if ($ips[$ip][1] > time() - 3600) {
            return 'ip-ban';
        }
        unset($ips[$ip]);
        sb_save_external_setting('ip-ban', $ips);
    }
    if ($email && $password) {

        // Login for registered users and agents
        $result = sb_db_get($query . 'WHERE email = "' . sb_db_escape($email) . '" LIMIT 1');
        if (sb_is_error($result)) {
            return $result;
        }
        $valid_login = sb_isset($result, 'password') && isset($result['user_type']) && sb_password_verify($password, $result['password']);
        if (!$valid_login) {
            $verification_url = sb_get_setting('login-verification-url');
            if ($verification_url) {
                $response = sb_curl($verification_url . (strpos($verification_url, '?') ? '&' : '?') . 'email=' . $email . '&password=' . urlencode($password));
                if (isset($response['first_name'])) {
                    unset($response['user_type']);
                    $response = sb_add_user($response, $response['details'], false);
                    if (!sb_is_validation_error($response) && is_numeric($response)) {
                        $result = sb_db_get($query . 'WHERE id = ' . sb_db_escape($response, true));
                        $valid_login = true;
                    }
                }
            }
        }
        if ($valid_login && $SB_LOGIN && $SB_LOGIN['id'] != $result['id']) {
            sb_db_query('UPDATE sb_conversations SET user_id = ' . $result['id'] . ' WHERE user_id = ' . $SB_LOGIN['id']);
        }
    } else if ($user_id && $user_token) {

        // Login for visitors
        $result = sb_db_get($query . 'WHERE id = ' . sb_db_escape($user_id, true) . ' AND token = "' . sb_db_escape($user_token) . '"');
        if (sb_is_error($result)) {
            return $result;
        }
        if (isset($result['user_type']) && isset($result['token'])) {
            $valid_login = true;
        }
    }
    if ($valid_login) {
        $settings = ['id' => $result['id'], 'profile_image' => $result['profile_image'], 'first_name' => $result['first_name'], 'last_name' => $result['last_name'], 'email' => $result['email'], 'user_type' => $result['user_type'], 'token' => $result['token'], 'url' => SB_URL, 'password' => $result['password']];
        if (isset($result['department'])) {
            $settings['department'] = $result['department'];
        }
        sb_set_cookie_login($settings);
        $SB_LOGIN = $settings;
        //LiveSmart code change start. Code added to integrate LiveSmart check user.
        $livesmart = sb_get_setting('livesmart-settings');
        if ($result['email'] && isset($livesmart) && isset($livesmart['livesmart_url'])) {
            liveSmartCheckUser($result['email'], $result['password'], $result['email'], $livesmart['livesmart_url'], $result['first_name'], $result['last_name']);
        }
        //LiveSmart code change end.
        return [$settings, sb_encryption(json_encode($settings))];
    }
    $ips[$ip] = empty($ips[$ip]) ? [1, time()] : [$ips[$ip][0] + 1, $ips[$ip][1]];
    sb_save_external_setting('ip-ban', $ips);
    return false;
}

function sb_update_login($profile_image, $first_name, $last_name, $email, $department = '', $user_type = false, $user_id = false) {
    global $SB_LOGIN;
    $settings = sb_get_cookie_login();
    if (empty($settings)) {
        $settings = [];
    }
    if ($user_id) {
        $settings['id'] = $user_id;
    }
    $settings['profile_image'] = $profile_image;
    $settings['first_name'] = $first_name;
    $settings['last_name'] = $last_name;
    $settings['email'] = $email;
    $settings['department'] = $department == 'NULL' || !$department || $department === false ? null : $department;
    if ($user_type) {
        $settings['user_type'] = $user_type;
    }
    if (!headers_sent()) {
        sb_set_cookie_login($settings);
    }
    $SB_LOGIN = $settings;
    return [$settings, sb_encryption(json_encode($settings))];
}

function sb_logout() {
    global $SB_LOGIN;
    if (!headers_sent()) {
        $time = time() - 3600;
        setcookie('sb-login', '', $time);
    }
    $SB_LOGIN = null;
    return true;
}

function sb_get_active_user($login_data = false, $database = false, $login_app = false, $user_token = false) {
    global $SB_LOGIN;
    $return = false;
    if ($SB_LOGIN) {
        $return = $SB_LOGIN;
    }
    if ($return === false && !empty($login_data)) {
        $return = json_decode(sb_encryption($login_data, false), true);
    }
    if ($return === false) {
        $return = sb_get_cookie_login();
    }
    if ($login_app !== false) {
        if (!is_array($login_app)) {
            $login_app = json_decode($login_app, true);
        }
        $app = $login_app[1];
        $login_app_data = $login_app[0];
        if (defined('SB_WP') && $app == 'wp') {
            if ($return === false || !isset($return['email'])) {
                $return = sb_wp_get_active_user($login_app_data);
                if (isset($return[1])) {
                    $return = array_merge($return[0], ['cookie' => $return[1]]);
                }
            } else {
                $wp_user = sb_wp_get_user($login_app_data[0]);
                if (isset($wp_user['email']) && $wp_user['email'] != $return['email']) {
                    $return = sb_wp_get_active_user($login_app_data);
                }
            }
        } else if ($app == 'default' && $login_app_data && (!$return || sb_isset($return, 'email') != sb_isset($login_app_data, 'email'))) {
            $return = sb_add_user_and_login($login_app_data, sb_isset($login_app_data, 'extra', []), false);
            if (sb_is_validation_error($return) && $return->error == 'duplicate-email' && !empty($login_app_data['password'])) {
                $active_user = sb_db_get('SELECT id, token FROM sb_users WHERE password = "' . sb_db_escape($login_app_data['password']) . '" AND email = "' . sb_isset($login_app_data, 'email', '') . '" LIMIT 1');
                $return = $active_user ? sb_login('', '', $active_user['id'], $active_user['token']) : false;
            }
            $return = is_array($return) ? array_merge($return[0], ['cookie' => $return[1]]) : false;
        } else if (defined('SB_PERFEX') && $app == 'perfex') {
            $return = sb_perfex_get_active_user_function($return, $login_app_data);
        } else if (defined('SB_WHMCS') && $app == 'whmcs') {
            $return = sb_whmcs_get_active_user_function($return, $login_app_data);
        } else if (defined('SB_AECOMMERCE') && $app == 'aecommerce') {
            $return = sb_aecommerce_get_active_user_function($return, $login_app_data);
        }
    }
    if (($database && $return && isset($return['id'])) || $user_token) {
        $keys = ['id', 'profile_image', 'first_name', 'last_name', 'email', 'password', 'user_type'];
        $active_user = sb_db_get('SELECT ' . implode(',', $keys) . ' FROM sb_users WHERE ' . ($user_token ? ('token = "' . sb_db_escape($user_token) . '"') : ('id = ' . $return['id'])));
        if ($active_user && (empty($return['password']) || empty($active_user['password']) || $return['password'] == $active_user['password']) && (!sb_is_agent($active_user['user_type']) || $active_user['user_type'] == $return['user_type'])) {
            for ($i = 0; $i < count($keys); $i++) {
                $return[$keys[$i]] = $active_user[$keys[$i]];
            }
            $return['phone'] = sb_get_user_extra($return['id'], 'phone');
            $return['cookie'] = sb_encryption(json_encode($return));
        } else if ($login_data !== false && $login_app !== false) {
            unset($_COOKIE['sb-login']);
            $SB_LOGIN = false;
            return sb_get_active_user(false, $database, $login_app);
        } else
            $return = false;
    }
    if ($return !== false) {
        if (!$SB_LOGIN) {
            $SB_LOGIN = $return;
        } else if ($SB_LOGIN['id'] != $return['id']) {
            sb_db_query('UPDATE sb_conversations SET user_id = ' . $return['id'] . ' WHERE user_id = ' . $SB_LOGIN['id']);
        }
    }
    return $return;
}

function sb_set_cookie_login($value) {
    if (!headers_sent()) {
        setcookie('sb-login', sb_encryption(json_encode($value)), time() + 315569260, '/', sb_get_setting('cookie-domain', ''));
    }
}

function sb_get_cookie_login() {
    $cookie = isset($_COOKIE['sb-login']) ? $_COOKIE['sb-login'] : sb_isset($_POST, 'login-cookie');
    if ($cookie) {
        $response = json_decode(sb_encryption($cookie, false), true);
        return empty($response) ? false : $response;
    }
    return false;
}

function sb_password_verify($password, $hash) {
    $success = password_verify($password, $hash);
    if (!$success && defined('SB_WP')) {
        $wp_hasher = new SBPasswordHash(8, true);
        $success = $wp_hasher->CheckPassword($password, $hash);
    }
    return $success;
}

function sb_is_agent($user = false, $exclude_bot = false, $only_admin = false) {
    if ($user === '') {
        return false;
    }
    $user = $user === false ? sb_get_active_user() : (is_string($user) ? ['user_type' => $user] : $user);
    if (!$user) {
        return !empty($GLOBALS['SB_FORCE_ADMIN']);
    }
    return (!$only_admin && $user['user_type'] == 'agent') || $user['user_type'] == 'admin' || (!$exclude_bot && $user['user_type'] == 'bot');
}

function sb_get_agent_department() {
    if (sb_is_agent() && !defined('SB_API')) {
        $user = sb_get_active_user();
        return sb_isset($user, 'department');
    }
    return false;
}

function sb_supervisor() {
    $settings = sb_get_setting('supervisor');
    return in_array(sb_get_active_user_ID(), explode(',', str_replace(' ', '', sb_isset($settings, 'supervisor-id')))) ? $settings : false;
}

function sb_envato_purchase_code_validation($purchase_code, $full_details = false) {
    $settings = sb_get_setting('envato-validation');
    $response = json_decode(sb_curl('https://api.envato.com/v3/market/author/sale?code=' . $purchase_code, '', ['Authorization: Bearer ' . $settings['envato-validation-token']], 'GET'), true);
    $id = isset($response['item']) ? sb_isset($response['item'], 'id') : false;
    if ($id) {
        $product_ids = explode(',', str_replace(' ', '', $settings['envato-validation-product-ids']));
        if (in_array($id, $product_ids) && ($response['license'] == 'Extended License' || ($response['license'] == 'Regular License' && !$settings['envato-validation-extended-license-only']))) {
            if ($full_details) {
                $response['purchase_code'] = $purchase_code;
                return $response;
            }
            return true;
        }
    }
    return 'invalid-envato-purchase-code';
}

/*
 * -----------------------------------------------------------
 * USERS
 * -----------------------------------------------------------
 *
 * 1. Add a new user or agent.
 * 2. Add a new user extra details
 * 3. Add a new user and login it
 * 4. Delete a user and all the related information (conversations, messages)
 * 5. Delete multiple users and all the related information (conversations, messages)
 * 6. Delete all leads
 * 7. Update a user or agent.
 * 8. Update a user or agent detail or extra detail.
 * 9. Update a visitor to lead
 * 10. Update the current user and a conversation message
 * 11. Return the user with the given id
 * 12. Return all users, Agents
 * 13. Return the users registered after the given date
 * 14. Search users based on the gived keyword
 * 15. Return the users count grouped by user type
 * 16. Return the user additional details
 * 17. Return the agent or admin with the given ID
 * 18. Set the active admin if any and register if required
 * 19. Return the full name of a user
 * 20. Save a CSV file with all users details
 * 21. Save automatic information from the user: IP, Country, OS, Browser
 * 22. Set and get the current page URL of a user
 * 23. Create or update the bot
 * 24. Return the bot ID
 * 25. Return the user or the last agent of a conversation
 * 26. Return an array with the agents ids
 * 27. Generate the profile picture of the user from its name
 * 28. Return the users who have the requested details
 * 29. Return the ID of the active user
 * 30. Get a user from a detail
 * 31. Check if the user is typing on the chat
 * 32. Check if an agent is typing in a conversation
 * 33. Set the user typing status
 * 34. Set agent raring
 * 35. Get agent rating
 * 36. Split a full name into first name and last name
 * 37. Get the IP information
 *
 */

function sb_add_user($settings = [], $settings_extra = [], $hash_password = true) {
    $keys = ['profile_image', 'first_name', 'last_name', 'email', 'user_type', 'password', 'department'];
    for ($i = 0; $i < count($keys); $i++) {
        $settings[$keys[$i]] = sb_isset($settings, $keys[$i], '');
        if (!is_string($settings[$keys[$i]])) {
            $settings[$keys[$i]] = trim($settings[$keys[$i]][0]);
        }
    }
    $password = $settings['password'];
    if (!empty($settings['email'])) {
        $settings['email'] = sb_db_escape($settings['email']);
        $existing_email = sb_db_get('SELECT user_type FROM sb_users WHERE email = "' . $settings['email'] . '" LIMIT 1');
        if ($existing_email) {
            if (sb_get_setting('duplicate-emails') && !sb_is_agent($existing_email['user_type'])) {
                sb_db_query('UPDATE sb_users SET email = NULL WHERE email = "' . $settings['email'] . '"');
            } else
                return new SBValidationError('duplicate-email');
        }
    }
    if (!empty($settings_extra['phone']) && sb_get_user_by('phone', $settings_extra['phone'][0]) && !sb_get_setting('duplicate-emails')) {
        return new SBValidationError('duplicate-phone');
    }
    if (empty($settings['profile_image'])) {
        $settings['profile_image'] = sb_get_avatar($settings['first_name'], $settings['last_name']);
    }
    if (empty($settings['first_name'])) {
        $name = sb_get_setting('visitor-prefix');
        $settings['first_name'] = $name ? $name : 'User';
        $settings['last_name'] = '#' . rand(0, 99999);
    }
    if (empty($settings['user_type'])) {
        $settings['user_type'] = empty($settings['email']) ? 'visitor' : 'user';
    } else if (!in_array($settings['user_type'], ['visitor', 'user', 'lead', 'agent', 'admin', 'bot'])) {
        return new SBValidationError('invalid-user-type');
    }
    if ($settings['user_type'] == 'user') {
        if (!empty($settings['first_name']) && substr($settings['last_name'], 0, 1) == '#') {
            $settings['last_name'] = '';
        }
    }
    if (sb_is_agent($settings) && !sb_is_agent(false, true, true)) {
        return sb_error('security-error', 'sb_add_user');
    }
    if (!empty($password) && $hash_password) {
        $password = password_hash($password, PASSWORD_DEFAULT);
    }
    if (empty($settings['department'])) {
        $settings['department'] = sb_is_agent() && sb_isset(sb_get_active_user(), 'department') ? sb_get_active_user()['department'] : 'NULL';
    }
    if (isset($settings_extra['envato-purchase-code'])) {
        $response = sb_envato_purchase_code_validation($settings_extra['envato-purchase-code'][0]);
        if ($response !== true) {
            return new SBValidationError('invalid-envato-purchase-code');
        }
    }
    $now = gmdate('Y-m-d H:i:s');
    $token = bin2hex(openssl_random_pseudo_bytes(20));
    $query = 'INSERT INTO sb_users(first_name, last_name, password, email, profile_image, user_type, creation_time, token, department, last_activity) VALUES ("' . sb_db_escape($settings['first_name']) . '", "' . sb_db_escape($settings['last_name']) . '", "' . sb_db_escape($password) . '", ' . ($settings['email'] ? '"' . $settings['email'] . '"' : 'NULL') . ', "' . sb_db_escape($settings['profile_image']) . '", "' . $settings['user_type'] . '", "' . $now . '", "' . $token . '", ' . sb_db_escape($settings['department']) . ', "' . $now . '")';
    $user_id = sb_db_query($query, true);
    if (!sb_is_error($user_id) && is_numeric($user_id) && $user_id > 0 && !empty($settings_extra)) {
        sb_add_new_user_extra($user_id, $settings_extra);
    }
    if (!sb_is_error($user_id) && !sb_is_agent() && ($settings['user_type'] == 'user' || $settings['user_type'] == 'lead' || sb_get_setting('visitor-autodata'))) {
        sb_user_autodata($user_id);
    }
    if ($settings['user_type'] == 'visitor') {
        sb_reports_update('visitors');
    }
    if (isset($_POST['payload']) && isset($_POST['payload']['rich-messages']) && isset($_POST['payload']['rich-messages']['registration'])) {
        sb_reports_update('registrations');
    }
    if ($settings['email']) {
        sb_newsletter($settings['email'], $settings['first_name'], $settings['last_name']);
    }
    if (sb_is_cloud() && sb_is_agent($settings['user_type'])) {
        sb_cloud_set_agent($settings['email']);
    }
    //LiveSmart code change start. Code added to integrate LiveSmart check user.
    $livesmart = sb_get_setting('livesmart-settings');
    if ($settings['email'] && isset($livesmart) && isset($livesmart['livesmart_url'])) {
        liveSmartInsertUser($settings['email'], $settings['password'], $settings['email'], $livesmart['livesmart_url'], $settings['first_name'], $settings['last_name']);
    }
    //LiveSmart code change end.
    return $user_id;
}

function sb_add_new_user_extra($user_id, $settings) {
    $query = '';
    $user_id = sb_db_escape($user_id, true);
    foreach ($settings as $key => $setting) {
        if (is_array($setting) && $setting[0] && $setting[0] != 'null') {
            $query .= '("' . $user_id . '", "' . sb_db_escape($key) . '", "' . sb_db_escape($setting[1]) . '", "' . sb_db_escape($setting[0]) . '"),';
        }
    }
    if ($query) {
        $query = 'INSERT IGNORE INTO sb_users_data(user_id, slug, name, value) VALUES ' . substr($query, 0, -1);
        return sb_db_query($query);
    }
    return false;
}

function sb_add_user_and_login($settings, $settings_extra, $hash_password = true) {
    $response = sb_add_user($settings, $settings_extra, $hash_password);
    if (is_numeric($response)) {
        $token = sb_db_get('SELECT token FROM sb_users WHERE id = ' . $response);
        return sb_login('', '', $response, $token['token']);
    }
    return $response;
}

function sb_delete_user($user_id) {
    if (sb_is_cloud()) {
        $user = sb_get_user($user_id);
        if ($user && sb_is_agent($user)) {
            sb_cloud_set_agent($user['email'], 'delete');
        }
    }
    $user_id = sb_db_escape($user_id, true);
    $ids = sb_db_get('SELECT id FROM sb_conversations WHERE user_id = ' . $user_id, false);
    for ($i = 0; $i < count($ids); $i++) {
        sb_delete_attachments($ids[$i]['id']);
    }
    if (sb_get_setting('logs')) {
        sb_logs('Agent ' . sb_get_user_name() . ' #' . sb_get_active_user_ID() . ' deleted the user #' . $user_id);
    }
    return sb_db_query('DELETE FROM sb_users WHERE id = ' . $user_id);
}

function sb_delete_users($user_ids) {
    $query = '';
    for ($i = 0; $i < count($user_ids); $i++) {
        $user_id = sb_db_escape($user_ids[$i], true);
        $query .= $user_id . ',';
        $ids = sb_db_get('SELECT id FROM sb_conversations WHERE user_id = ' . $user_id, false);
        for ($j = 0; $j < count($ids); $j++) {
            sb_delete_attachments($ids[$j]['id']);
        }
        //LiveSmart code change start. Code added to integrate LiveSmart check user.
        $livesmart = sb_get_setting('livesmart-settings');
        if (isset($livesmart) && isset($livesmart['livesmart_url'])) {
            $result = sb_db_get('SELECT email FROM sb_users WHERE id = "' . $user_ids[$i] . '" LIMIT 1');
            liveSmartDeleteUser($result['email'], $livesmart['livesmart_url']);
        }
        //LiveSmart code change end.
    }
    return sb_db_query('DELETE FROM sb_users WHERE id IN (' . sb_db_escape(substr($query, 0, -1)) . ')');
}

function sb_delete_leads() {
    return sb_db_query('DELETE FROM sb_users WHERE user_type = "lead"');
}

function sb_update_user($user_id, $settings, $settings_extra = [], $hash_password = true) {
    $user_id = sb_db_escape($user_id, true);
    $keys = ['profile_image', 'first_name', 'last_name', 'email', 'user_type', 'password', 'department'];
    for ($i = 0; $i < count($keys); $i++) {
        $settings[$keys[$i]] = sb_isset($settings, $keys[$i], '');
        if (!is_string($settings[$keys[$i]])) {
            $settings[$keys[$i]] = $settings[$keys[$i]][0];
        }
    }
    $profile_image = $settings['profile_image'];
    $first_name = trim($settings['first_name']);
    $last_name = trim($settings['last_name']);
    $email = trim($settings['email']);
    $user_type = $settings['user_type'];
    $password = isset($settings['password']) && $settings['password'] != '********' ? $settings['password'] : '';
    $department = sb_isset($settings, 'department', 'NULL');
    $active_user = sb_get_active_user();
    $query = '';
    if (sb_is_agent($user_type) && !sb_is_agent(false, true, true)) {
        return sb_error('security-error', 'sb_update_user');
    }
    if ($email) {
        $email = sb_db_escape($email);
        $existing_email = sb_db_get('SELECT user_type, email FROM sb_users WHERE email = "' . $email . '" AND id <> ' . $user_id);
        if ($existing_email) {
            if (sb_get_setting('duplicate-emails') && !sb_is_agent($existing_email['user_type'])) {
                sb_db_query('UPDATE sb_users SET email = NULL WHERE email = "' . $email . '"');
            } else {
                return new SBValidationError('duplicate-email');
            }
        }
    }
    if (!empty($settings_extra['phone']) && intval(sb_db_get('SELECT COUNT(*) as count FROM sb_users_data WHERE slug = "phone" AND (value = "' . $settings_extra['phone'][0] . '"' . (strpos($settings_extra['phone'][0], '+') !== false ? (' OR value = "' . str_replace('+', '00', $settings_extra['phone'][0]) . '"') : '') . ') AND user_id <> ' . sb_db_escape($user_id, true))['count']) > 0 && !sb_get_setting('duplicate-emails')) {
        return new SBValidationError('duplicate-phone');
    }
    if ($user_type == 'user' && $first_name && $last_name && substr($last_name, 0, 1) == '#') {
        $last_name = '';
    }
    if (!$profile_image || $profile_image == SB_URL . '/media/user.svg') {
        $profile_image = sb_get_avatar($first_name, $last_name);
    }
    if ($first_name) {
        $query .= ', first_name = "' . sb_db_escape($first_name) . '"';
    }
    if ($password) {
        if ($hash_password) {
            $password = password_hash($password, PASSWORD_DEFAULT);
        }
        $query .= ', password = "' . sb_db_escape($password) . '"';
    }
    if (!$department) {
        $department = 'NULL';
    }
    if (!$user_type && !sb_is_agent($user_type)) {
        $user_type = $email ? 'user' : (intval(sb_db_get('SELECT COUNT(*) AS count FROM sb_conversations WHERE user_id = ' . $user_id)['count']) > 0 ? 'lead' : 'visitor');
    }
    if ($email && sb_is_cloud() && sb_is_agent($user_type)) {
        $old_email = sb_isset(sb_db_get('SELECT email FROM sb_users WHERE id = ' . $user_id), 'email');
        if ($old_email && $old_email != $email) {
            sb_cloud_set_agent($old_email, 'update', $email);
        }
    }
    $query_final = 'UPDATE sb_users SET profile_image = "' . sb_db_escape($profile_image) . '", last_name = "' . sb_db_escape($last_name) . '", user_type = "' . sb_db_escape($user_type) . '", email = ' . (strlen($email) == 0 ? 'NULL' : '"' . sb_db_escape($email) . '"') . ', department = ' . sb_db_escape($department) . $query . ' WHERE id = ' . $user_id;
    $result = sb_db_query($query_final);

    // Extra user details
    if ($active_user && $active_user['id'] == $user_id) {
        $result = sb_update_login($profile_image, $first_name, $last_name, $email, $department, $user_type, $user_id);
        sb_user_autodata($user_id);
    }
    if (isset($settings_extra['language']) && !empty($settings_extra['language'][0])) {
        $settings_extra['browser_language'] = ['', ''];
    }
    foreach ($settings_extra as $key => $setting) {
        if (is_array($setting)) {
            sb_db_query('REPLACE INTO sb_users_data SET name = "' . sb_db_escape($setting[1]) . '", value = "' . sb_db_escape($setting[0]) . '", slug = "' . sb_db_escape($key) . '", user_id = ' . $user_id);
        }
    }
    sb_db_query('DELETE FROM sb_users_data WHERE user_id = ' . $user_id . ' AND value = ""');
    if (defined('SB_SLACK') && $first_name && $last_name && sb_get_setting('slack-active')) {
        sb_slack_rename_channel($user_id, trim($first_name . '_' . $last_name));
    }
    if ($email) {
        sb_newsletter($email, $first_name, $last_name);
    }

    // More
    if (sb_is_agent() && sb_get_setting('logs')) {
        sb_logs('updated the user details of the user #' . $user_id);
    }
    return $result;
}

function sb_update_user_value($user_id, $slug, $value, $name = false) {
    $user_id = sb_db_escape($user_id, true);
    if (!sb_is_agent(false, true, true) && ((sb_is_agent() && sb_isset(sb_db_get('SELECT user_type FROM sb_users WHERE id = ' . $user_id), 'user_type') == 'admin') || ($slug == 'user_type' && ($value == 'agent' || $value == 'admin')))) {
        return sb_error('security-error', 'sb_update_user_value');
    }
    if (empty($value)) {
        return sb_db_query('DELETE FROM sb_users_data WHERE user_id = ' . $user_id . ' AND slug = "' . sb_db_escape($slug) . '"');
    }
    if (in_array($slug, ['profile_image', 'first_name', 'last_name', 'email', 'password', 'department', 'user_type', 'last_activity', 'typing'])) {
        if ($slug == 'password')
            $value = password_hash($value, PASSWORD_DEFAULT);
        if ($slug == 'email') {
            sb_newsletter($value);
        }
        if ($user_id == sb_get_active_user_ID()) {
            $GLOBALS['SB_LOGIN'][$slug] = $value;
        }
        return sb_db_query('UPDATE sb_users SET ' . sb_db_escape($slug) . ' = "' . sb_db_escape($value) . '" WHERE id = ' . $user_id);
    }
    return sb_db_query('REPLACE INTO sb_users_data SET name = "' . sb_db_escape($name ? $name : sb_string_slug($slug, 'string')) . '", value = "' . sb_db_escape($value) . '", slug = "' . sb_db_escape($slug) . '", user_id = ' . $user_id);
}

function sb_update_user_to_lead($user_id) {
    sb_user_autodata($user_id);
    return sb_update_user_value($user_id, 'user_type', 'lead');
}

function sb_update_user_and_message($user_id, $settings, $settings_extra = [], $message_id = false, $message = false, $payload = false) {
    $result = sb_update_user($user_id, $settings, $settings_extra);
    $rich_message = sb_isset($payload, 'rich-messages');
    if (sb_is_validation_error($result) && $result->code() == 'duplicate-email') {
        return $result;
    }
    if ($message_id) {
        if ($message)
            sb_update_message($message_id, $message, false, $payload);
        $message = '';
        foreach ($settings as $key => $setting) {
            if ($setting[0])
                $message .= sb_string_slug($key, 'string') . ': ' . $setting[0] . PHP_EOL;
        }
        foreach ($settings_extra as $key => $setting) {
            $message .= sb_string_slug($key, 'string') . ': ' . $setting[0] . PHP_EOL;
        }
        sb_send_agents_notifications($message, false, sb_db_get('SELECT conversation_id FROM sb_messages WHERE id = ' . sb_db_escape($message_id, true))['conversation_id']);
    }
    if ($rich_message) {
        if (isset($rich_message['sb-follow-up-form'])) {
            sb_reports_update('follow-up');
        }
        if (isset($rich_message['registration'])) {
            sb_reports_update('registrations');
        }
    }
    return $result;
}

function sb_get_user($user_id, $extra = false) {
    $user = sb_db_get(SELECT_FROM_USERS . ', password FROM sb_users WHERE id = ' . sb_db_escape($user_id, true));
    if (isset($user) && is_array($user)) {
        if ($extra) {
            $user['details'] = sb_get_user_extra($user_id);
        }
        return $user;
    }
    return false;
}

function sb_get_users($sorting = ['creation_time', 'DESC'], $user_types = [], $search = '', $pagination = 0, $extra = false, $user_ids = false) {
    $query = '';
    $query_search = '';
    $count = count($user_types);
    $sorting_field = $sorting[0];
    $main_field_sorting = in_array($sorting_field, ['id', 'first_name', 'last_name', 'email', 'profile_image', 'user_type', 'creation_time', 'last_activity', 'department']);
    if ($count) {
        for ($i = 0; $i < $count; $i++) {
            $query .= 'user_type = "' . sb_db_escape($user_types[$i]) . '" OR ';
        }
        $query = '(' . substr($query, 0, strlen($query) - 4) . ')';
    }
    if ($user_ids) {
        $count_user_ids = count($user_ids);
        if ($count_user_ids) {
            if ($query)
                $query .= ' AND ';
            $query .= ' sb_users.id IN (' . sb_db_escape(implode(',', $user_ids)) . ')';
        }
    }
    if ($search) {
        $searched_users = sb_search_users($search);
        $count_search = count($searched_users);
        if ($count_search > 0) {
            for ($i = 0; $i < $count_search; $i++) {
                $query_search .= $searched_users[$i]['id'] . ',';
            }
            $query .= ($query ? ' AND ' : '') . 'sb_users.id IN (' . substr($query_search, 0, -1) . ')';
        }
    }
    if ($query) {
        $query = ' WHERE user_type <> "bot" AND ' . $query;
    } else {
        $query = ' WHERE user_type <> "bot"';
    }
    $users = sb_db_get(SELECT_FROM_USERS . ' FROM sb_users ' . $query . sb_routing_and_department_db('sb_users', true) . ($main_field_sorting ? (' ORDER BY ' . sb_db_escape($sorting_field) . ' ' . sb_db_escape($sorting[1])) : '') . ' LIMIT ' . (intval(sb_db_escape($pagination, true)) * 100) . ',100', false);
    $users_count = count($users);
    if (!$users_count) {
        return [];
    }
    if (isset($users) && is_array($users)) {
        $is_array = is_array($extra);
        if ($extra && (!$is_array || count($extra))) {
            $query = '';
            $query_extra = '';
            for ($i = 0; $i < $users_count; $i++) {
                $query .= $users[$i]['id'] . ',';
                $users[$i]['extra'] = [];
            }
            if ($is_array) {
                for ($i = 0; $i < count($extra); $i++) {
                    $query_extra .= 'slug = "' . $extra[$i] . '" OR ';
                }
                if ($query_extra)
                    $query_extra = ' AND (' . substr($query_extra, 0, -4) . ')';
            }
            $users_extra = sb_db_get('SELECT user_id, slug, value FROM sb_users_data WHERE user_id IN (' . substr($query, 0, -1) . ')' . $query_extra . ' ORDER BY user_id', false);
            for ($i = 0; $i < count($users_extra); $i++) {
                $user_id = $users_extra[$i]['user_id'];
                $slug = $users_extra[$i]['slug'];
                $value = $users_extra[$i]['value'];
                for ($j = 0; $j < $users_count; $j++) {
                    if ($users[$j]['id'] == $user_id) {
                        $users[$j]['extra'][$slug] = $value;
                        break;
                    }
                }
            }
        }
        if (!$main_field_sorting) {
            if ($sorting[1] == 'ASC') {
                usort($users, function ($a, $b) use ($sorting_field) {
                    return isset($a['extra'][$sorting_field]) ? $a['extra'][$sorting_field] <=> (isset($b['extra'][$sorting_field]) ? $b['extra'][$sorting_field] : '') : -1;
                });
            } else {
                usort($users, function ($a, $b) use ($sorting_field) {
                    return isset($b['extra'][$sorting_field]) ? $b['extra'][$sorting_field] <=> (isset($a['extra'][$sorting_field]) ? $a['extra'][$sorting_field] : '') : -1;
                });
            }
        }
        return $users;
    } else {
        return sb_error('db-error', 'sb_get_users', $users);
    }
}

function sb_get_new_users($datetime) {
    $datetime = sb_db_escape($datetime);
    $users = sb_db_get(SELECT_FROM_USERS . ' FROM sb_users WHERE user_type <> "bot" AND ' . (is_numeric($datetime) ? ('id > ' . $datetime) : ('creation_time > "' . $datetime . '"')) . sb_routing_and_department_db('sb_users', true) . ' ORDER BY id DESC', false);
    if (isset($users) && is_array($users)) {
        return $users;
    } else {
        return sb_error('db-error', 'sb_get_new_users', $users);
    }
}

function sb_search_users($search) {
    $search = trim(sb_db_escape($search));
    $query = '';
    if (strpos($search, ' ') > 0) {
        $search = explode(' ', $search);
    } else {
        $search = [$search];
    }
    for ($i = 0; $i < count($search); $i++) {
        $search[$i] = sb_db_escape($search[$i]);
        $query .= 'first_name LIKE "%' . $search[$i] . '%" OR last_name LIKE "%' . $search[$i] . '%" OR ';
    }
    $result = sb_db_get('SELECT * FROM sb_users WHERE user_type <> "bot" AND (' . $query . ' email LIKE "%' . $search[0] . '%" OR id IN (SELECT user_id FROM sb_users_data WHERE value LIKE "%' . $search[0] . '%")) ' . sb_routing_and_department_db('sb_conversations', true) . ' GROUP BY sb_users.id;', false);
    if (isset($result) && is_array($result)) {
        return $result;
    } else {
        return sb_error('db-error', 'sb_search_users', $result);
    }
}

function sb_count_users() {
    $query = sb_routing_and_department_db('sb_users', true);
    if ($query) {
        $users = sb_db_get(substr($query, strpos($query, '(SE') + 1, -1), false);
        $query = '';
        for ($i = 0; $i < count($users); $i++) {
            $query .= $users[$i]['id'] . ',';
        }
        if ($query) {
            $query = 'AND id IN (' . substr($query, 0, -1) . ')';
        }
    }
    return sb_db_get('SELECT SUM(CASE WHEN user_type <> "bot" ' . $query . ' THEN 1 ELSE 0 END) AS `all`, SUM(CASE WHEN user_type = "lead"' . $query . ' THEN 1 ELSE 0 END) AS `lead`, SUM(CASE WHEN user_type = "user"' . $query . ' THEN 1 ELSE 0 END) AS `user`, SUM(CASE WHEN user_type = "visitor"' . $query . ' THEN 1 ELSE 0 END) AS `visitor` FROM sb_users');
}

function sb_get_user_extra($user_id, $slug = false, $default = false) {
    if (empty($user_id)) {
        return false;
    }
    $response = sb_db_get('SELECT slug, name, value FROM sb_users_data WHERE user_id = ' . sb_db_escape($user_id, true) . ($slug ? ' AND slug = "' . sb_db_escape($slug) . '" LIMIT 1' : ''), $slug);
    return $slug ? sb_isset($response, 'value', $default) : $response;
}

function sb_get_agent($agent_id) {
    $user = sb_db_get('SELECT id, first_name, last_name, profile_image, department FROM sb_users WHERE (user_type = "admin" OR user_type = "agent" OR user_type = "bot") AND id = ' . sb_db_escape($agent_id, true));
    if (isset($user) && is_array($user)) {
        $user['details'] = sb_get_user_extra($agent_id);
        for ($i = 0; $i < count($user['details']); $i++) {
            if ($user['details'][$i]['slug'] == 'country') {
                $country = $user['details'][$i]['value'];
                $countries = json_decode(file_get_contents(SB_PATH . '/resources/json/countries.json'), true);
                $user['country_code'] = $countries[$country];
                if (isset($countries[$country]) && file_exists(SB_PATH . '/media/flags/' . strtolower($countries[$country]) . '.png')) {
                    $user['flag'] = strtolower($countries[$country]) . '.png';
                }
                break;
            }
        }
        return $user;
    } else {
        return false;
    }
}

function sb_set_external_active_admin($external_user) {
    $active_user = sb_get_active_user();
    if (!$external_user)
        return false;
    if (!sb_is_agent($active_user) || empty($active_user['url']) || $active_user['url'] != SB_URL || empty($external_user['email']) || $external_user['email'] != $active_user['email']) {
        $settings = false;
        $db_user = sb_db_get('SELECT * FROM sb_users WHERE email = "' . sb_db_escape($external_user['email']) . '" LIMIT 1');
        if (!empty($db_user) && isset($db_user['password']) && $external_user['password'] == $db_user['password']) {
            if (!sb_is_agent($db_user)) {
                $db_user['user_type'] = 'agent';
                sb_db_query('UPDATE sb_users SET user_type = "agent" WHERE email = "' . sb_db_escape($external_user['email']) . '"');
            }
            $settings = ['id' => $db_user['id'], 'profile_image' => $db_user['profile_image'], 'first_name' => $db_user['first_name'], 'last_name' => $db_user['last_name'], 'email' => $db_user['email'], 'user_type' => $db_user['user_type'], 'token' => $db_user['token']];
        } else if (empty($db_user)) {
            $settings = ['id' => sb_isset($external_user, 'id'), 'profile_image' => sb_isset($external_user, 'profile_image', ''), 'first_name' => $external_user['first_name'], 'last_name' => $external_user['last_name'], 'password' => $external_user['password'], 'email' => $external_user['email'], 'user_type' => 'admin'];
            if (!sb_is_agent($active_user)) {
                global $SB_LOGIN;
                $SB_LOGIN = $settings;
            }
            $settings['id'] = sb_add_user($settings, sb_isset($external_user, 'extra', []), false);
        } else {
            sb_logout();
            return 'logout';
        }
        if ($settings) {
            unset($settings['password']);
            global $SB_LOGIN;
            $settings['url'] = SB_URL;
            if (!headers_sent()) {
                sb_set_cookie_login($settings);
                $SB_LOGIN = $settings;
            }
            return true;
        }
        return false;
    }
    return true;
}

function sb_get_user_name($user = false) {
    $user = $user === false ? sb_get_active_user() : $user;
    $name = trim(sb_isset($user, 'first_name', '') . ' ' . sb_isset($user, 'last_name', ''));
    return substr(sb_isset($user, 'last_name', '-'), 0, 1) != '#' ? $name : sb_get_setting('visitor-default-name', $name);
}

function sb_csv_users($user_ids = false) {
    $custom_fields = sb_get_setting('user-additional-fields');
    $header = ['Birthdate', 'City', 'Company', 'Country', 'Facebook', 'Language', 'LinkedIn', 'Phone', 'Twitter', 'Website'];
    $users = sb_db_get('SELECT id, first_name, last_name, email, profile_image, user_type, creation_time FROM sb_users WHERE user_type <> "bot" ORDER BY first_name', false);
    $users_response = [];
    if (isset($custom_fields) && is_array($custom_fields)) {
        for ($i = 0; $i < count($custom_fields); $i++) {
            array_push($header, $custom_fields[$i]['extra-field-name']);
        }
    }
    for ($i = 0; $i < count($users); $i++) {
        $user = $users[$i];
        if ($user_ids && !in_array($user['id'], $user_ids))
            continue;
        if ($user['user_type'] != 'visitor' && $user['user_type'] != 'lead') {
            $user_extra = sb_db_get('SELECT * FROM sb_users_data WHERE user_id = ' . $user['id'], false);
            for ($j = 0; $j < count($header); $j++) {
                $key = $header[$j];
                $user[$key] = '';
                for ($y = 0; $y < count($user_extra); $y++) {
                    if ($user_extra[$y]['name'] == $key) {
                        $user[$key] = $user_extra[$y]['value'];
                        break;
                    }
                }
            }
        } else {
            for ($j = 0; $j < count($header); $j++) {
                $user[$header[$j]] = '';
            }
        }
        array_push($users_response, $user);
    }
    return sb_csv($users_response, array_merge(['ID', 'First Name', 'Last Name', 'Email', 'Profile Image', 'Type', 'Creation Time'], $header), 'users');
}

function sb_user_autodata($user_id) {
    if (!defined('SB_API') && empty($GLOBALS['SB_FORCE_ADMIN'])) {
        $settings = [];
        $user_agent = sb_isset($_SERVER, 'HTTP_USER_AGENT');

        // IP and related data
        $ip_data = sb_ip_info('status,country,countryCode,city,timezone,currency');

        if ($ip_data) {
            $settings['ip'] = [$ip_data['ip'], 'IP'];
            if (isset($ip_data['city']) && isset($ip_data['country'])) {
                $settings['location'] = [$ip_data['city'] . ', ' . $ip_data['country'], 'Location'];
            }
            if (isset($ip_data['timezone'])) {
                $settings['timezone'] = [$ip_data['timezone'], 'Timezone'];
            }
            if (isset($ip_data['currency'])) {
                $settings['currency'] = [$ip_data['currency'], 'Currency'];
            }
            if (isset($ip_data['countryCode'])) {
                $settings['country_code'] = [$ip_data['countryCode'], 'Country Code'];
            }
        }

        // Browser
        $browser = '';
        $agent = strtolower($user_agent);
        if (strpos($agent, 'safari/') and strpos($agent, 'opr/')) {
            $browser = 'Opera';
        } else if (strpos($agent, 'safari/') and strpos($agent, 'chrome/') and strpos($agent, 'edge/') == false) {
            $browser = 'Chrome';
        } else if (strpos($agent, 'msie')) {
            $browser = 'Internet Explorer';
        } else if (strpos($agent, 'firefox/')) {
            $browser = 'Firefox';
        } else if (strpos($agent, 'edge/')) {
            $browser = 'Microsoft Edge';
        } else if (strpos($agent, 'safari/') and strpos($agent, 'opr/') == false and strpos($agent, 'chrome/') == false) {
            $browser = 'Safari';
        }
        ;
        if ($browser) {
            $settings['browser'] = [$browser, 'Browser'];
        }

        // Browser language
        if (isset($_SERVER['HTTP_ACCEPT_LANGUAGE'])) {
            $settings['browser_language'] = [strtoupper(sb_language_code($_SERVER['HTTP_ACCEPT_LANGUAGE'])), 'Language'];
        }

        // OS
        $os = '';
        $os_array = ['/windows nt 10/i' => 'Windows 10', '/windows nt 6.3/i' => 'Windows 8.1', '/windows nt 6.2/i' => 'Windows 8', '/windows nt 6.1/i' => 'Windows 7', '/windows nt 6.0/i' => 'Windows Vista', '/windows nt 5.2/i' => 'Windows Server 2003/XP x64', '/windows xp/i' => 'Windows XP', '/windows nt 5.0/i' => 'Windows 2000', '/windows me/i' => 'Windows ME', '/macintosh|mac os x/i' => 'Mac OS X', '/mac_powerpc/i' => 'Mac OS 9', '/linux/i' => 'Linux', '/ubuntu/i' => 'Ubuntu', '/iphone/i' => 'iPhone', '/ipod/i' => 'iPod', '/ipad/i' => 'iPad', '/android/i' => 'Android', '/blackberry/i' => 'BlackBerry', '/webos/i' => 'Mobile'];
        foreach ($os_array as $regex => $value) {
            if (preg_match($regex, $user_agent)) {
                $os = $value;
            }
        }
        if ($os) {
            $settings['os'] = [$os, 'OS'];
        }

        // Current url
        if (isset($_POST['current_url'])) {
            $settings['current_url'] = [$_POST['current_url'], 'Current URL'];
        } else if (isset($_SERVER['HTTP_REFERER'])) {
            $settings['current_url'] = [$_SERVER['HTTP_REFERER'], 'Current URL'];
        }

        // Save the data
        return sb_add_new_user_extra($user_id, $settings);
    }
    return false;
}

function sb_current_url($user_id = false, $url = false) {
    if (!empty($user_id)) {
        if ($url === false) {
            $url = sb_db_get('SELECT value FROM sb_users_data WHERE user_id ="' . sb_db_escape($user_id, true) . '" and slug = "current_url" LIMIT 1');
            return isset($url['value']) ? $url['value'] : false;
        }
        return sb_update_user_value($user_id, 'current_url', $url, 'Current URL');
    }
    return false;
}

function sb_update_bot($name = '', $profile_image = '') {
    $bot = sb_db_get('SELECT id, profile_image, first_name, last_name FROM sb_users WHERE user_type = "bot" LIMIT 1');
    if (!$name) {
        $name = 'Bot';
    }
    if (!$profile_image) {
        $profile_image = SB_URL . '/media/user.svg';
    }
    $settings = ['profile_image' => [$profile_image], 'first_name' => [$name], 'user_type' => ['bot']];
    if (!$bot) {
        return sb_add_user($settings);
    } else if ($bot['profile_image'] != $profile_image || $bot['first_name'] != $name) {
        return sb_update_user($bot['id'], $settings);
    }
    return false;
}

function sb_get_bot_id() {
    if (isset($GLOBALS['sb-bot-id'])) {
        return $GLOBALS['sb-bot-id'];
    }
    $bot_id = sb_isset(sb_db_get('SELECT id FROM sb_users WHERE user_type = "bot" LIMIT 1'), 'id');
    if (!$bot_id) {
        $bot_id = sb_update_bot();
    }
    $GLOBALS['sb-bot-id'] = $bot_id;
    return $bot_id;
}

function sb_get_user_from_conversation($conversation_id, $agent = false) {
    $conversation_id = sb_db_escape($conversation_id, true);
    $user_id = sb_isset(sb_db_get($agent ? ('SELECT A.id FROM sb_users A, sb_messages B WHERE A.id = B.user_id AND (A.user_type = "admin" OR A.user_type = "agent") AND B.conversation_id = ' . $conversation_id . ' GROUP BY A.id') : ('SELECT A.id, A.email FROM sb_users A, sb_conversations B WHERE A.id = B.user_id AND B.id = ' . $conversation_id)), 'id');
    return $user_id ? sb_get_user($user_id) : false;
}

function sb_get_agents_ids($admins = true) {
    $agents_ids = sb_db_get('SELECT id FROM sb_users WHERE user_type = "agent"' . ($admins ? ' OR user_type = "admin"' : ''), false);
    for ($i = 0; $i < count($agents_ids); $i++) {
        $agents_ids[$i] = intval($agents_ids[$i]['id']);
    }
    return $agents_ids;
}

function sb_get_avatar($first_name, $last_name = '') {
    $picture_url = SB_URL . '/media/user.svg';
    $first_char_last_name = substr($last_name, 0, 1);
    if (!empty($first_name) && $first_char_last_name != '#' && (ctype_digit($first_name[0]) || ctype_alpha($first_name[0])) && (!$first_char_last_name || ctype_digit($first_char_last_name) || ctype_alpha($first_char_last_name))) {
        $file_name = rand(99, 9999999) . '.png';
        $picture_url = sb_download_file('https://ui-avatars.com/api/?background=random&size=512&font-size=0.35&name=' . $first_name . '+' . $last_name, $file_name);
        if (!sb_get_multi_setting('amazon-s3', 'amazon-s3-active') && !defined('SB_CLOUD_AWS_S3')) {
            $path = sb_upload_path(false, true) . '/' . $file_name;
            if (!file_exists($path) || filesize($path) < 1000)
                $picture_url = SB_URL . '/media/user.svg';
        }
    }
    return $picture_url;
}

function sb_get_users_with_details($details, $user_ids = false) {
    $response = [];
    $primary_details = ['last_name', 'email', 'profile_image', 'department'];
    if ($user_ids == 'all')
        $user_ids = false;
    if ($user_ids == 'agents')
        $user_ids = sb_get_agents_ids();
    if ($user_ids) {
        $user_ids = '(' . (is_string($user_ids) ? str_replace(' ', '', sb_db_escape($user_ids)) : sb_db_escape(substr(json_encode($user_ids), 1, -1))) . ')';
    }
    for ($i = 0; $i < count($details); $i++) {
        $detail = sb_db_escape($details[$i]);
        $primary = in_array($detail, $primary_details);
        if ($primary) {
            $query = 'SELECT id, ' . $detail . ' AS `value` FROM sb_users WHERE ' . $detail . ' IS NOT NULL AND ' . $detail . ' <> ""' . ($user_ids ? ' AND id IN ' . $user_ids : '');
        } else {
            $query = 'SELECT user_id AS `id`, value FROM sb_users_data WHERE slug = "' . $detail . '"' . ($user_ids ? ' AND user_id IN ' . $user_ids : '');
        }
        $response[$detail] = sb_db_get($query, false);
    }
    return $response;
}

function sb_get_active_user_ID() {
    $active_user = sb_get_active_user();
    return $active_user ? sb_isset($active_user, 'id') : false;
}

function sb_is_typing($user_id, $conversation_id) {
    $typing = sb_db_get('SELECT COUNT(*) as typing FROM sb_users WHERE id = ' . sb_db_escape($user_id, true) . ' AND typing = "' . sb_db_escape($conversation_id, true) . '"');
    return $typing['typing'] != 0;
}

function sb_is_agent_typing($conversation_id) {
    return sb_db_get('SELECT id, first_name, last_name FROM sb_users WHERE typing = ' . sb_db_escape($conversation_id, true) . ' AND (user_type = "agent" OR user_type = "admin") AND id <> ' . sb_get_active_user_ID());
}

function sb_set_typing($user_id = false, $conversation_id = false, $source = false) {
    if ($source && isset($source[0])) {
        if ($source[0] == 'fb')
            return sb_messenger_set_typing($source[1], $source[2]);
        if ($source[0] == 'tw')
            return sb_twitter_set_typing($source[1]);
        return false;
    } else {
        return sb_pusher_active() ? sb_pusher_trigger('private-user-' . $user_id, 'client-typing') : sb_db_query('UPDATE sb_users SET typing = ' . sb_db_escape($conversation_id, true) . ' WHERE id = ' . sb_db_escape($user_id, true));
    }
}

function sb_set_rating($settings, $payload = false, $message_id = false, $message = false) {
    if (!isset($settings['conversation_id'])) {
        return new SBValidationError('conversation-id-not-found');
    } else if (sb_conversation_security_error($settings['conversation_id'])) {
        return sb_error('security-error', 'sb_set_rating');
    }
    if (isset($settings['rating'])) {
        $ratings = sb_get_external_setting('ratings');
        if (!isset($ratings))
            $ratings = [];
        $ratings[$settings['conversation_id']] = $settings;
        sb_save_external_setting('ratings', $ratings);
        if ($message_id)
            sb_update_message($message_id, $message, false, $payload);
        return true;
    }
    return false;
}

function sb_get_rating($agent_id) {
    $ratings = sb_get_external_setting('ratings');
    $positive = 0;
    $negative = 0;
    if (!empty($ratings)) {
        foreach ($ratings as $rating) {
            if (sb_isset($rating, 'agent_id', -1) == $agent_id) {
                if ($rating['rating'] == 1) {
                    $positive++;
                } else {
                    $negative++;
                }
            }
        }
    }
    return [$positive, $negative];
}

function sb_split_name($name) {
    $space_in_name = strpos($name, ' ');
    return [$space_in_name ? trim(substr($name, 0, $space_in_name)) : $name . $space_in_name, $space_in_name ? trim(substr($name, $space_in_name)) : ''];
}

function sb_ip_info($fields) {
    $ip = isset($_SERVER['HTTP_CF_CONNECTING_IP']) && substr_count($_SERVER['HTTP_CF_CONNECTING_IP'], '.') == 3 ? $_SERVER['HTTP_CF_CONNECTING_IP'] : $_SERVER['REMOTE_ADDR'];
    if (strlen($ip) > 6) {
        $ip_data = json_decode(sb_download('http://ip-api.com/json/' . $ip . '?fields=' . $fields), true);
        if (!empty($ip_data)) {
            $ip_data['ip'] = $ip;
            return $ip_data;
        }
    }
    return false;
}

/*
 * -----------------------------------------------------------
 * ONLINE STATUS
 * -----------------------------------------------------------
 *
 * 1. Update the user last activity date
 * 2. Check if a date is considered online
 * 3. Check if at least one agent or admin is online
 * 4. Return the online users
 * 5. Return an array with the IDs of the online users
 * 6. Check if a user is online
 *
 */

function sb_update_users_last_activity($user_id = -1, $return_user_id = -1, $check_slack = false) {
    $result = $user_id != -1 ? sb_update_user_value($user_id, 'last_activity', gmdate('Y-m-d H:i:s')) : false;
    if ($return_user_id != -1) {
        $last_activity = sb_db_get('SELECT last_activity FROM sb_users WHERE id = ' . sb_db_escape($return_user_id, true));
        if (!isset($last_activity['last_activity'])) {
            return 'offline';
        }
        if (sb_is_online($last_activity['last_activity'])) {
            return 'online';
        } else {
            return defined('SB_SLACK') && $check_slack ? sb_slack_presence($return_user_id) : 'offline';
        }
    }
    return $result;
}

function sb_is_online($datetime) {
    return strtotime($datetime) > strtotime(gmdate('Y-m-d H:i:s', time() - 30));
}

function sb_agents_online() {
    $online = $online = sb_pusher_active() ? sb_pusher_agents_online() : intval(sb_db_get('SELECT COUNT(*) as count FROM sb_users WHERE (user_type = "agent" OR user_type = "admin") AND last_activity > "' . gmdate('Y-m-d H:i:s', time() - 30) . '"')['count']) > 0;
    return $online ? true : (defined('SB_SLACK') && sb_get_setting('slack-active') ? sb_slack_presence() == 'online' : false);
}

function sb_get_online_users($sorting = 'creation_time', $agents = false) {
    $online_user_ids = sb_get_online_user_ids($agents);
    return empty($online_user_ids) ? [] : sb_get_users([$sorting, 'DESC'], $agents ? ['admin', 'agent'] : [], '', 0, false, $online_user_ids);
}

function sb_get_online_user_ids($agents = false) {
    $user_ids = [];
    $query = 'SELECT id FROM sb_users WHERE (' . ($agents ? 'user_type = "admin" OR user_type = "agent"' : 'user_type = "visitor" OR user_type = "lead" OR user_type = "user"') . ')';
    if (sb_pusher_active()) {
        $users = sb_db_get($query, false);
        $users_id_check = [];
        $pusher_users = sb_pusher_get_online_users();
        for ($i = 0; $i < count($users); $i++) {
            array_push($users_id_check, $users[$i]['id']);
        }
        for ($i = 0; $i < count($pusher_users); $i++) {
            $id = $pusher_users[$i]->id;
            if (in_array($id, $users_id_check)) {
                array_push($user_ids, $id);
            }
        }
    } else {
        $users = sb_db_get($query . ' AND last_activity > "' . gmdate('Y-m-d H:i:s', time() - 30) . '"', false);
        for ($i = 0; $i < count($users); $i++) {
            array_push($user_ids, $users[$i]['id']);
        }
    }
    return $user_ids;
}

function sb_is_user_online($user_id) {
    if (empty($user_id)) {
        return false;
    }
    if (sb_pusher_active()) {
        $users = sb_pusher_get_online_users();
        for ($i = 0; $i < count($users); $i++) {
            if ($users[$i]->id == $user_id)
                return true;
        }
    } else {
        $user = sb_db_get('SELECT last_activity, user_type FROM sb_users WHERE id = ' . sb_db_escape($user_id, true));
        if (isset($user['last_activity']) && sb_is_online($user['last_activity'])) {
            return true;
        }
    }
    if (defined('SB_SLACK') && sb_get_setting('slack-active') && isset($user['user_type']) && sb_is_agent($user['user_type'])) {
        if (sb_slack_presence($user_id) == 'online')
            return true;
    }
    return false;
}

function sb_get_user_by($by, $value) {
    $query = SELECT_FROM_USERS . ' FROM sb_users A WHERE ';
    if (empty($value))
        return false;
    $value = sb_db_escape($value);
    switch ($by) {
        case 'email':
            return sb_db_get($query . 'email = "' . $value . '" LIMIT 1');
        case 'first_name':
            return sb_db_get($query . 'first_name = "' . $value . '" LIMIT 1');
        case 'last_name':
            return sb_db_get($query . 'last_name = "' . $value . '" LIMIT 1');
        case 'phone':
            return sb_db_get($query . 'id IN (SELECT user_id FROM sb_users_data WHERE slug = "phone" AND (value = "' . $value . '" OR value = "' . (strpos($value, '+') === false ? ('+' . $value) : (str_replace('+', '00', $value))) . '")) LIMIT 1');
        default:
            return sb_db_get($query . 'id IN (SELECT user_id FROM sb_users_data WHERE slug = "' . sb_db_escape($by) . '" AND value = "' . $value . '") LIMIT 1');
    }
}

/*
 * -----------------------------------------------------------
 * QUEUE AND ROUTING
 * -----------------------------------------------------------
 *
 * 1. Update the queue and return the current queue status
 * 2. Internal function
 * 3. Assign the conversation to an agent
 * 4. Route conversations to agents
 *
 */

function sb_queue($conversation_id, $department = false) {
    $position = 0;
    $queue_db = sb_get_external_setting('queue', []);
    $settings = sb_get_setting('queue');
    $queue = [];
    $index = 0;
    $unix_now = time();
    $unix_min = strtotime('-1 minutes');
    $conversation = sb_db_get('SELECT user_id, agent_id, source FROM sb_conversations WHERE id = ' . sb_db_escape($conversation_id, true));
    $messaging_platform = !empty($conversation['source']) && $conversation['source'] != 'tk';
    $show_progress = !sb_execute_bot_message('offline', 'check');
    if (!empty(sb_isset($conversation, 'agent_id'))) {
        return 0;
    }
    if (!sb_isset_num($department) || $department == -1) {
        $department = false;
    }
    for ($i = 0; $i < count($queue_db); $i++) {
        if ($unix_min < intval($queue_db[$i][1])) {
            if ($queue_db[$i][0] == $conversation_id) {
                array_push($queue, [$conversation_id, $unix_now, $department]);
                $position = $index + 1;
            } else {
                array_push($queue, $queue_db[$i]);
            }
            if (!$department || $department == $queue_db[$i][2]) {
                $index++;
            }
        }
    }
    if (count($queue) == 0 || $position == 1) {
        $department = sb_db_escape($department);
        $counts = sb_db_get('SELECT COUNT(*) AS `count`, agent_id FROM sb_conversations WHERE (status_code = 0 OR status_code = 1 OR status_code = 2) AND agent_id IS NOT NULL' . ($department ? ' AND department = ' . $department : '') . ' GROUP BY agent_id', false);
        $cuncurrent_chats = !$settings || !$settings['queue-concurrent-chats'] ? 5 : intval($settings['queue-concurrent-chats']);
        $smaller = false;
        $pusher = sb_pusher_active();
        for ($i = 0; $i < count($counts); $i++) {
            $count = intval($counts[$i]['count']);
            if ($count < $cuncurrent_chats && ($smaller === false || $count < $smaller['count'])) {
                $smaller = $counts[$i];
            }
        }
        if ($smaller === false) {
            $query = '';
            for ($i = 0; $i < count($counts); $i++) {
                $query .= $counts[$i]['agent_id'] . ',';
            }
            if ($pusher) {
                $agents_ids = sb_get_agents_ids(false);
                $online_agents = sb_pusher_get_online_users();
                for ($i = 0; $i < count($online_agents); $i++) {
                    $online_agents[$i] = $online_agents[$i]->id;
                }
                for ($i = 0; $i < count($agents_ids); $i++) {
                    if (!in_array($agents_ids[$i], $online_agents)) {
                        $query .= $agents_ids[$i] . ',';
                    }
                }
            }
            $smaller = sb_db_get('SELECT id FROM sb_users WHERE user_type = "agent"' . ($query ? ' AND id NOT IN (' . substr($query, 0, -1) . ')' : '') . ($pusher ? '' : ' AND last_activity > "' . gmdate('Y-m-d H:i:s', time() - 30) . '"') . ($department ? ' AND department = ' . $department : '') . ' LIMIT 1');
            if (empty($smaller)) {
                $smaller = false;
            } else {
                $smaller = ['agent_id' => $smaller['id']];
            }
        }
        if ($smaller !== false) {
            sb_routing_assign_conversation($smaller['agent_id'], $conversation_id);
            array_shift($queue);
            $position = 0;
            $user_id = $conversation['user_id'];
            $message = sb_t(sb_isset($settings, 'queue-message-success', 'It\'s your turn! An agent will reply to you shortly.'));
            $message_id = sb_send_message(sb_get_bot_id(), $conversation_id, $message, [], 2)['id'];
            sb_send_agents_notifications(sb_isset(sb_get_last_message($conversation_id, false, $user_id), 'message'), false, $conversation_id);
            if ($messaging_platform) {
                sb_messaging_platforms_send_message($message, $conversation_id, $message_id);
            }
        } else if ($position == 0) {
            array_push($queue, [$conversation_id, $unix_now, $department]);
            $position = $index + 1;
        }
    } else if ($position == 0) {
        array_push($queue, [$conversation_id, $unix_now, $department]);
        $position = $index + 1;
    }
    sb_save_external_setting('queue', $queue);
    if ($messaging_platform && $position != 0) {
        sb_routing($conversation_id, $department);
        $message = sb_t($settings['queue-message']);
        if ($message && $show_progress) {
            $time = intval(sb_isset($settings, 'queue-response-time', 5)) * $position;
            $message = str_replace(['{position}', '{minutes}'], [$position, $time], $message);
            $message_id = sb_send_message(sb_get_bot_id(), $conversation_id, $message)['id'];
            sb_messaging_platforms_send_message($message, $conversation_id, $message_id);
        }
    }
    return [$position, $show_progress];
}

function sb_routing_and_department_db($table_name = 'sb_conversations', $users = false) {
    $is_users_table = $table_name == 'sb_users';
    $hide = sb_get_multi_setting('agent-hide-conversations', 'agent-hide-conversations-active');
    $routing = sb_isset(sb_get_active_user(), 'user_type') == 'agent' && (sb_get_multi_setting('queue', 'queue-active') || sb_get_setting('routing') || $hide);
    $routing_unassigned = $routing && $hide && sb_get_multi_setting('agent-hide-conversations', 'agent-hide-conversations-view');
    $department = sb_get_agent_department();
    $query = ($routing && !$is_users_table ? (' AND (' . $table_name . '.agent_id = ' . sb_get_active_user_ID() . ($routing_unassigned ? (' OR (' . $table_name . '.agent_id IS NULL OR ' . $table_name . '.agent_id = ""))') : ')')) : '') . ($department !== false ? ' AND ' . $table_name . '.department = ' . $department : '');
    return $query ? ($users ? ' AND id IN (SELECT ' . ($is_users_table ? 'id' : 'user_id') . ' FROM ' . $table_name . ' WHERE ' . substr($query, 4) . ')' : $query) : '';
}

function sb_routing_assign_conversation($agent_id, $conversation_id) {
    return sb_db_query('UPDATE sb_conversations SET agent_id = ' . (is_null($agent_id) ? 'NULL' : sb_db_escape($agent_id, true)) . ' WHERE id = ' . sb_db_escape($conversation_id, true));
}

function sb_routing($conversation_id = false, $department = false, $unassigned = false) {
    $count_last = 0;
    $index = 0;
    $online_agents = sb_get_online_user_ids(true);
    $department = sb_db_escape($department, true);
    $agents = count($online_agents) ? sb_db_get('SELECT id FROM sb_users WHERE user_type = "agent" AND id IN (' . implode(',', $online_agents) . ')' . (sb_isset_num($department) ? ' AND department = ' . $department : ''), false) : [];
    $count = count($agents);
    if ($count == 0) {
        if ($unassigned) {
            return $conversation_id ? sb_routing_assign_conversation(null, $conversation_id) : null;
        }
        $agents = sb_db_get('SELECT id FROM sb_users WHERE user_type = "agent"' . (sb_isset_num($department) ? ' AND department = ' . $department : ''), false);
        $count = count($agents);
    }
    if ($count) {
        for ($i = 0; $i < $count; $i++) {
            $count_now = intval(sb_db_get('SELECT COUNT(*) AS `count` FROM sb_conversations WHERE (status_code = 0 OR status_code = 1 OR status_code = 2) AND agent_id = ' . $agents[$i]['id'])['count']);
            if ($count_last > $count_now) {
                $index = $i;
                break;
            }
            $count_last = $count_now;
        }
        return $conversation_id == -1 || !$conversation_id ? $agents[$index]['id'] : sb_routing_assign_conversation($agents[$index]['id'], $conversation_id);
    }
    return false;
}


?>