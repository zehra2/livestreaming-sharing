/*
* Post create page
 */
"use strict";

$(function () {
    // Initing button save
    $('#savePostLivesmart').on('click',function () {
        let route = app.baseUrl + '/posts/save';
        let data = {
            'text': '<iframe src="' + $('#savePostLivesmart').data('url') + '" allow="camera; microphone; fullscreen; display-capture; accelerometer; autoplay; encrypted-media; picture-in-picture" style="background-color:#ffffff; padding: 0; margin:0; border:0;" width="100%" height="600" ></iframe>',
            'price': 0,
            'type': 'create'
        };
        $.ajax({
            type: 'POST',
            data: data,
            url: route,
            success: function (data) {
                console.log(data);
                let postID = data.id;
                // PostCreate.isSavingRedirect = true;
                window.addEventListener('beforeunload', function () {
                    $.ajax({
                        type: 'DELETE',
                        data: {
                            'id': postID
                        },
                        dataType: 'json',
                        url: app.baseUrl+'/posts/delete',
                        success: function (result) {
                            if(result.success){
                                launchToast('success',trans('Success'),result.message);
                            }
                            else{
                                launchToast('danger',trans('Error'),result.errors[0]);
                            }
                        },
                        error: function (result) {
                            launchToast('danger',trans('Error'),result.responseJSON.message);
                        }
                    });
                });
                launchToast('success', trans('Success'), trans('Stream is published'));
            },
            error: function (result) {
                console.log(result);
            }
        });
    });
});


