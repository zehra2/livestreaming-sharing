Video.vbayservices.com
or you can view this lin :https://docs.google.com/document/d/e/2PACX-1vTZQGLxibf7MqknVDjbfhvlaBJMvSOOXXKW7aygQNrEBHxSdm22XMdviaTza2bfpri9xJJ83OP-vsDD/pub

Extra code we added for facebook sharing
Proposal: Facebook Live Stream Integration Fix
Date: 5/6/2015
Prepared For: Vbayservices.com
Developer: By shaham


Project Overview
Objective: Resolve the “Feature Unavailable” error during Facebook Login to enable live streaming from your PHP/WebRTC application to Facebook Live.

Current Status:

Facebook Login integration partially works but throws the error:
“Feature Unavailable: Facebook Login is currently unavailable for this app…”
The app can authenticate users but fails to proceed due to Facebook restrictions.

Problem Diagnosis
The error occurs because Facebook has restricted login functionality for your app due to:

Incomplete App Configuration: Missing business verification, privacy policy, or OAuth settings.
Permissions Issues: Deprecated/unauthorized scopes (e.g., publish_video).
Policy Compliance: Facebook requires additional details to approve app functionality.

Work Already Completed
Facebook App ID (789473093346118) created.
Basic PHP integration with WebRTC for live streaming.
Facebook SDK initialized on the frontend.

Required Fixes
1. Complete Facebook App Configuration
Business Verification: Submit business details/docs to Facebook.
App Settings:
Add Privacy Policy URL (HTTPS).
Define App Domains (e.g., yourdomain.com).
Configure Valid OAuth Redirect URIs.
Permissions Cleanup:
Remove deprecated scopes (publish_video).
Request only approved permissions (pages_manage_engagement, pages_read_engagement).
2. Update Code Integration
Frontend:
Revise Facebook SDK initialization with valid scopes.
Implement error handling for login failures.
Backend (PHP):
Replace user tokens with Page Access Tokens for live streaming.
Validate OAuth flow with Facebook’s API.
3. Testing & Submission
Test with Facebook Test Users (non-admin roles).
Submit app for Facebook App Review with required permissions.

Task needs to be Review that we done correctly or not
Task

Description

1. App Configuration

Complete business verification, update app settings, fix OAuth URIs.

2. Permissions Cleanup

Remove invalid scopes, submit for pages_manage_engagement approval.

3. Code Updates

Refactor PHP token handling, update JavaScript SDK, error logging.

4. Testing

Validate with test users, debug tokens, ensure live stream starts.

5. App Review Submission

Prepare screencast/description for Facebook’s review team.


Deliverables
Working Facebook Login: No “Feature Unavailable” errors.
Live Stream Integration: Ability to broadcast from PHP/WebRTC to Facebook Live.
Documentation:
Updated code snippets for PHP and JavaScript.
Step-by-step guide for future token management.
App Review Approval: Confirmation from Facebook. (Already done)




ERROR



F


Files coding for facebook integration and livestreaming sharing are:

sdk.js 


<script>

  window.fbAsyncInit = function() {

    FB.init({

      appId      : '789473093346118',

      xfbml      : true,

      version    : 'v22.0'

    });

    FB.AppEvents.logPageView();

  };


  (function(d, s, id){

     var js, fjs = d.getElementsByTagName(s)[0];

     if (d.getElementById(id)) {return;}

     js = d.createElement(s); js.id = id;

     js.src = "https://connect.facebook.net/en_US/sdk.js";

     fjs.parentNode.insertBefore(js, fjs);

   }(document, 'script', 'facebook-jssdk'));

</script>



facebook-live.js



window.fbAsyncInit = function () {

  FB.init({

      appId: '789473093346118',

      cookie: true,

      xfbml: true,

      version: 'v19.0'

  });

};


(function (d, s, id) {

  var js, fjs = d.getElementsByTagName(s)[0];

  if (d.getElementById(id)) return;

  js = d.createElement(s); js.id = id;

  js.src = "https://connect.facebook.net/en_US/sdk.js";

  fjs.parentNode.insertBefore(js, fjs);

}(document, 'script', 'facebook-jssdk'));


// 👇 This is the missing function causing the error

function startFacebookLive() {

  FB.login(function(response) {

    if (response.authResponse) {

      console.log('Access Token:', response.authResponse.accessToken);

      // Proceed with your stream setup

    } else {

      console.error('User cancelled login');

    }

  }, {

    scope: 'pages_manage_engagement,pages_read_engagement,public_profile',

    auth_type: 'rerequest'

  });

}






Aouth.php


<!DOCTYPE html>

<html lang="en">

<head>

    <meta charset="UTF-8">

    <meta name="viewport" content="width=

    , initial-scale=1.0">

    <title>Document</title>

</head>

<body>

   

<?php

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

   

    // Example: Handle Facebook callback

    session_start();

   

    $appId = '789473093346118';

    $appSecret = '91dfa440560ea34af10927c0a199b5dc';

    $redirectUri = 'https://video.vbayservices.com/facebook-auth';

   

    // Step 1: Get authorization code

    if (!isset($_GET['code'])) {

        $authUrl = "https://www.facebook.com/v19.0/dialog/oauth?client_id=$appId&redirect_uri=$redirectUri&scope=pages_manage_engagement,pages_read_engagement";

        header("Location: $authUrl");

        exit;

    }

   

    // Step 2: Exchange code for access token

    $code = $_GET['code'];

    $tokenUrl = "https://graph.facebook.com/v19.0/oauth/access_token?client_id=$appId&client_secret=$appSecret&code=$code&redirect_uri=$redirectUri";

    $response = json_decode(file_get_contents($tokenUrl), true);

   

    if (isset($response['access_token'])) {

        $_SESSION['fb_access_token'] = $response['access_token'];

        // Proceed to create live stream

    } else {

        die("Error: " . $response['error']['message']);

    }

   

}













else {

    echo json_encode(['success' => false, 'message' => 'Invalid request method']);

}

?>





</body>

</html>




