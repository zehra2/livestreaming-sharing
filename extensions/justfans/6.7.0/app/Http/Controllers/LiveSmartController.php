<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class LiveSmartController extends Controller
{
    /**
     * Available settings types.
     * Note*: The values are translated over on view side
     * @var array
     */

    public function __construct()
    {

    }

    /**
     * Renders the main livesmart page.
     *
     * @param Request $request
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\View\View
     */
    public function index(Request $request)
    {
        return view('pages.livesmart', [
            'livesmart_url' => getSetting('livesmart.url'),
            'username' => Auth::user()->username
        ]);
    }

    /**
     * Renders the Video chat page
     *
     * @param Request $request
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\View\View
     */
    public function startVideo(Request $request)
    {
        return view('pages.livesmartvideo', [
            'livesmart_url' => getSetting('livesmart.url'),
            'room' => $request->route('room'),
            'params' => $request->route('params'),
            'publish' => false
        ]);
    }

    /**
     * Renders the streaming page
     *
     * @param Request $request
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\View\View
     */
    public function startStream(Request $request)
    {
        $params = ($request->route('room') === Auth::user()->username) ? 'eyJjb25maWciOiJjb25maWdfYnJvYWRjYXN0aW5nIiwiYWRtaW4iOjF9' : 'eyJjb25maWciOiJjb25maWdfYnJvYWRjYXN0aW5nIiwiZGlzYWJsZSI6dHJ1ZX0=';
        $publish = ($request->route('room') === Auth::user()->username);
        return view('pages.livesmartvideo', [
            'livesmart_url' => getSetting('livesmart.url'),
            'room' => $request->route('room'),
            'params' => $params,
            'publish' => $publish,
            'visitorParams' => 'eyJjb25maWciOiJjb25maWdfYnJvYWRjYXN0aW5nIiwiZGlzYWJsZSI6dHJ1ZX0='
        ]);
    }
}
