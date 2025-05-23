@extends('layouts.user-no-nav')
@section('page_title', __('LiveSmart Dashboard'))

@section('content')
    <div class="row">
        <div class="col-12 pr-0 min-vh-100 pt-4 border-right">
            <div class="px-3 pb-4 border-bottom">
                <h5 class="text-truncate text-bold mb-0 {{(Cookie::get('app_theme') == null ? (getSetting('site.default_user_theme') == 'dark' ? '' : 'text-dark-r') : (Cookie::get('app_theme') == 'dark' ? '' : 'text-dark-r'))}}">{{__('LiveSmart Dashboard')}}</h5>
            </div>
            <div class="mt-3 inline-border-tabs">
                <iframe src="{{$livesmart_url}}dash/integration.php?wplogin={{$username}}&url={{base64_encode($livesmart_url)}}" style="background-color:#ffffff; padding: 0; margin:0; border:0;" width="100%" height="600" ></iframe>
                <br/>
                <a href="{{$livesmart_url}}/dash/" target="_blank">{{__('LiveSmart Dashboard')}}</a>
            </div>
        </div>
    </div>
@stop
