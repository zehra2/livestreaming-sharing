@extends('layouts.user-no-nav')
@section('page_title', __('LiveSmart Dashboard'))
@section('scripts')
    {!!
        Minify::javascript([
            '/js/posts/create-livesmart.js',
         ])->withFullUrl()
    !!}
@stop
@section('content')
    <div class="row">
        <div class="col-12 pr-0 min-vh-100 pt-4 border-right">
            <iframe src="{{$livesmart_url}}/{{$room}}?p={{$params}}" allow="camera; microphone; fullscreen; display-capture; accelerometer; autoplay; encrypted-media; picture-in-picture" style="background-color:#ffffff; padding: 0; margin:0; border:0;" width="100%" height="600" ></iframe>
            <br/>
            <br/>
            @if(!GenericHelper::isUserVerified() && $publish)
                <button id="savePostLivesmart" data-url="{{$livesmart_url}}/{{$room}}?p={{$visitorParams}}" class="btn btn-outline-primary post-create-button mb-0">{{__('Publish')}}</button>
            @endif
        </div>
    </div>
@stop
