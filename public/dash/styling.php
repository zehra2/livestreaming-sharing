<?php
include_once 'header.php';
?>
<link rel="stylesheet" href="css/coloris.min.css"/>
<script src="js/coloris.min.js"></script>
<h1 class="h3 mb-2 text-gray-800" data-localize="meeting_personalization"></h1>
<div id="error" style="display:none;" class="alert alert-danger"></div>
<div id="success" class="alert alert-success" style="display: none;"></div>
<?php if ($_SESSION["tenant"] == 'lsv_mastertenant' || $_SESSION["tenant_admin"]) {
        $cssFile = $_SESSION['agent']['tenant'];
        $originalCssFile = 'conference';
        $originalCssContent = file_get_contents('../css/' . $originalCssFile . '.css');
        if (!file_exists('../css/' . $cssFile . '.css')) {
            file_put_contents('../css/' . $cssFile . '.css', $originalCssContent);
        }
        $cssContent = file_get_contents('../css/' . $cssFile . '.css');

        $tnt = $_SESSION['agent']['tenant'];
        $stmt = $pdo->prepare('SELECT * FROM ' . $dbPrefix . 'stylings WHERE tenant = ?');
        $stmt->execute([$tnt]);
        $style = $stmt->fetch();

        $json = '{"body-bg":"#ececec", "blue-bg":"#484d75", "video-element-back": "#ffffff", "white": "#ffffff", "chat-bg": "#ffffff", "chat-bg-active": "#efefef", "left-msg-bg": "#d9d9d9", "right-msg-bg": "#48b0f7", "chat-msg": "#444444", "chat-icon": "#6c757d"}';
        $defaultArray = json_decode($json);
        if ($style && $style['style']) {
            $json = $style['style'];
        }
        $obj = json_decode($json);
        $obj = (object) array_merge((array) $defaultArray, (array) $obj);
        $bodyBgImg = '';
        $bodyBg = $obj->{'body-bg'};
        if (substr_count($bodyBg, 'url') > 0) {
            $bodyBgImg = str_replace('url(\'', '', $obj->{'body-bg'});
            $bodyBgImg = str_replace('\') center no-repeat', '', $bodyBgImg);
            $bodyBg = '#ececec';
        }
        $videoElementBackImg = '';
        $videoElementBack = $obj->{'video-element-back'};
        if (substr_count($videoElementBack, 'url') > 0) {
            $videoElementBackImg = str_replace('url(\'', '', $obj->{'video-element-back'});
            $videoElementBackImg = str_replace('\') center no-repeat', '', $videoElementBackImg);
            $videoElementBack = '#ffffff';
        }
    ?>

    <div class="row">
        <div class="col-lg-6">
            <div class="p-1">
                <h4 data-localize="css_styling"></h5>
                <h6 data-localize="css_styling_info"></h6>
                <hr>
                <h6 data-localize="body_background"></h6>
                    <fieldset style="padding-left:10px;">
                    <div class="form-group">
                        <label for="body-bg"></label><br/>
                        <input type="text" value="<?php echo $bodyBg;?>" data-coloris class="form-control" id="body-bg" aria-describedby="body-bg">
                    </div>
                    <div class="form-group">
                        <label for="body-bg-img" data-localize="or_choose_image">></label>
                        <input type="file" accept=".jpg, .jpeg, .png" class="form-control" name="body-bg-img" id="body-bg-img" value="" />
                    </div>
                    <span data-localize="orchoose_images"></span>
                    <div class="form-group" id="body-bg-images"></div>
                    <div class="form-group">
                        <img id="body-bg-preview" src="<?php echo $bodyBgImg;?>" width="200"/>
                        <a href="javascript:void(0);" id="body-bg-delete">
                        <i class="fas fa-fw fa-trash"></i>
                        </a>
                    </div>
                </fieldset>
                <hr>
                <h6 data-localize="main_color"></h6>
                <fieldset style="padding-left:10px;">
                    <div class="form-group">
                        <label for="blue-bg"></label><br/>
                        <input type="text" value="<?php echo @$obj->{'blue-bg'};?>" data-coloris class="form-control" id="blue-bg" aria-describedby="blue-bg">
                    </div>
                </fieldset>
                <hr>
                <h6 data-localize="main_font_color"></h6>
                <fieldset style="padding-left:10px;">
                    <div class="form-group">
                        <label for="white"></label><br/>
                        <input type="text" value="<?php echo @$obj->{'white'};?>" data-coloris class="form-control" id="white" aria-describedby="white">
                    </div>
                </fieldset>
                <hr>
                <h6 data-localize="video_back_color"></h6>
                <fieldset style="padding-left:10px;">
                    <div class="form-group">
                        <label for="video-element-back"></label><br/>
                        <input type="text" value="<?php echo $videoElementBack;?>" data-coloris class="form-control" id="video-element-back" aria-describedby="video-element-back">
                    </div>
                    <div class="form-group">
                        <label for="video-element-back-img" data-localize="or_choose_image">></label>
                        <input type="file" accept=".jpg, .jpeg, .png" class="form-control" name="video-element-back-img" id="video-element-back-img" value="" />
                    </div>
                    <span data-localize="orchoose_images"></span>
                    <div class="form-group" id="video-element-back-images"></div>
                    <div class="form-group">
                        <img id="video-element-back-preview" src="<?php echo $videoElementBackImg;?>" width="200"/>
                        <a href="javascript:void(0);" id="video-element-back-delete">
                        <i class="fas fa-fw fa-trash"></i>
                        </a>
                    </div>
                </fieldset>
                <hr>
                <h6 data-localize="chat_styling"></h6>
                <fieldset style="padding-left:10px;">
                    <div class="form-group">
                        <label for="chat-bg" data-localize="chat_background"></label><br/>
                        <input type="text" value="<?php echo @$obj->{'chat-bg'};?>" data-coloris class="form-control" id="chat-bg" aria-describedby="chat-bg">
                    </div>
                    <div class="form-group">
                        <label for="chat-bg-active" data-localize="chat_background_active"></label><br/>
                        <input type="text" value="<?php echo @$obj->{'chat-bg-active'};?>" data-coloris class="form-control" id="chat-bg-active" aria-describedby="chat-bg-active">
                    </div>
                    <div class="form-group">
                        <label for="left-msg-bg" data-localize="chat_left_msg_bg"></label><br/>
                        <input type="text" value="<?php echo @$obj->{'left-msg-bg'};?>" data-coloris class="form-control" id="left-msg-bg" aria-describedby="left-msg-bg">
                    </div>
                    <div class="form-group">
                        <label for="right-msg-bg" data-localize="chat_right_msg_bg"></label><br/>
                        <input type="text" value="<?php echo @$obj->{'right-msg-bg'};?>" data-coloris class="form-control" id="right-msg-bg" aria-describedby="right-msg-bg">
                    </div>
                    <div class="form-group">
                        <label for="chat-msg" data-localize="chat_main_font_color"></label><br/>
                        <input type="text" value="<?php echo @$obj->{'chat-msg'};?>" data-coloris class="form-control" id="chat-msg" aria-describedby="chat-msg">
                    </div>
                    <div class="form-group">
                        <label for="chat-icon" data-localize="chat_system_font_color"></label><br/>
                        <input type="text" value="<?php echo @$obj->{'chat-icon'};?>" data-coloris class="form-control" id="chat-icon" aria-describedby="chat-icon">
                    </div>
                </fieldset>
                <hr>
                <input type="hidden" class="form-control" value="<?php echo $videoElementBackImg;?>" id="video-element-back-hidden">
                <input type="hidden" class="form-control" value="<?php echo $bodyBgImg;?>" id="body-bg-hidden">
                <a href="javascript:void(0);" id="restoreStyling" class="btn btn-secondary" data-localize="restore_default">
                </a>

                <a href="javascript:void(0);" id="saveStyling" class="btn btn-primary" data-localize="save">
                </a>

            </div>
        </div>
        <div class="col-lg-6">
            <div class="p-1">
                <h4 data-localize="css_file"></h5>
                <h6 data-localize="css_file_info"></h6>
                <div class="form-group">
                    <textarea rows="10" cols="20" class="form-control" id="css_content"><?php echo $cssContent;?></textarea>
                </div>
                <hr>
                <a href="javascript:void(0);" id="restoreStylingFile" class="btn btn-secondary" data-localize="restore_default">
                </a>

                <a href="javascript:void(0);" id="saveStylingFile" class="btn btn-primary" data-localize="save">
                </a>
            </div>
        </div>
    </div>
<script>

const previewPhoto = (elem, input) => {
    const file = input.files;
    if (file) {
        const fileReader = new FileReader();
        var preview = elem;
        fileReader.onload = event => {
            preview.setAttribute('src', event.target.result);
        }
        fileReader.readAsDataURL(file[0]);
    }
}
const input = document.getElementById('video-element-back-img');
input.addEventListener('change', function() { previewPhoto(document.getElementById('video-element-back-preview'), input); });
const inputHome = document.getElementById('body-bg-img');
inputHome.addEventListener('change', function() { previewPhoto(document.getElementById('body-bg-preview'), inputHome); });

const folder = '../img/virtual/';
function handleBacks(id, elem) {
    document.getElementById(elem + '-preview').setAttribute('src', folder + id);
    $('#' + elem + '-hidden').val(folder + id);
}
const homeImages = document.getElementById('body-bg-images');
for(i = 1; i <= 20; i++) {
    let img = document.createElement('img');
    img.setAttribute('src', folder + i + '.jpg');
    img.setAttribute('id', i + '.jpg');
    img.setAttribute('width', '80');
    img.setAttribute('style', 'cursor:pointer; padding: 2px;');
    homeImages.append(img);
    img.addEventListener('click', function() { handleBacks(img.id, 'body-bg'); });
}
const backImages = document.getElementById('video-element-back-images');
for(i = 1; i <= 20; i++) {
    let img = document.createElement('img');
    img.setAttribute('src', folder + i + '.jpg');
    img.setAttribute('id', i + '.jpg');
    img.setAttribute('width', '80');
    img.setAttribute('style', 'cursor:pointer; padding: 2px;');
    backImages.append(img);
    img.addEventListener('click', function() { handleBacks(img.id, 'video-element-back'); });
}
</script>


<?php } else {
    header("Location: dash.php");
    die();
    } ?>
<?php
include_once 'footer.php';
