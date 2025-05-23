<?php
include_once 'header.php';
?>
<h1 class="h3 mb-2 text-gray-800" data-localize="meeting_videoai"></h1>
<div id="error" style="display:none;" class="alert alert-danger"></div>
<div id="success" class="alert alert-success" style="display: none;"></div>
<?php if ($_SESSION["tenant"] == 'lsv_mastertenant' || $_SESSION["tenant_admin"]) {
?>

    <div class="row">
        <div class="col-lg-6">
            <div class="p-1">
                <h4 data-localize="avatars_ai"></h4>
                <p data-localize="avatars_ai_info"></p>
                <fieldset>
                    <h5 data-localize="avatars_ai_free"></h5>
                    <div class="form-group" id="avatar_container_free"></div>
                </fieldset>
                <hr>
                <fieldset>
                    <h5 data-localize="avatars_ai_paid"></h5>
                    <a data-toggle="collapse" data-target="#avatar_container_paid" aria-expanded="false" aria-controls="avatar_container_paid" class="btn btn-secondary" href="javascript:#1;" data-localize="toggle_avatars"></a>
                    <div class="form-group collapse multi-collapse" id="avatar_container_paid"></div>
                </fieldset>
                <hr>
                <h6 data-localize="voices_ai"></h6>
                <p data-localize="voices_ai_info"></p>
                <fieldset>
                    <select class="form-control" name="video_ai_voice" id="video_ai_voice"></select>
                </fieldset>
                <hr>
                <div class="form-group">
                    <h6 data-localize="language"></h6>
                    <select class="form-control" name="language" id="language">
                        <option value="">-</option>
                        <option value="af">Afrikaans (af)</option>
                        <option value="sq">Albanian (sq)</option>
                        <option value="am">Amharic (am)</option>
                        <option value="ar">Arabic (ar)</option>
                        <option value="hy">Armenian (hy)</option>
                        <option value="az">Azerbaijani (az)</option>
                        <option value="eu">Basque (eu)</option>
                        <option value="be">Belarusian (be)</option>
                        <option value="bn">Bengali (bn)</option>
                        <option value="bs">Bosnian (bs)</option>
                        <option value="bg">Bulgarian (bg)</option>
                        <option value="ca">Catalan (ca)</option>
                        <option value="ceb">Cebuano (ceb)</option>
                        <option value="ny">Chichewa (ny)</option>
                        <option value="zh">Chinese (Simplified) (zh)</option>
                        <option value="zh-TW">Chinese (Traditional) (zh-TW)</option>
                        <option value="co">Corsican (co)</option>
                        <option value="hr">Croatian (hr)</option>
                        <option value="cs">Czech (cs)</option>
                        <option value="da">Danish (da)</option>
                        <option value="nl">Dutch (nl)</option>
                        <option value="en">English (en)</option>
                        <option value="eo">Esperanto (eo)</option>
                        <option value="et">Estonian (et)</option>
                        <option value="tl">Filipino (tl)</option>
                        <option value="fi">Finnish (fi)</option>
                        <option value="fr">French (fr)</option>
                        <option value="fy">Frisian (fy)</option>
                        <option value="gl">Galician (gl)</option>
                        <option value="ka">Georgian (ka)</option>
                        <option value="de">German (de)</option>
                        <option value="el">Greek (el)</option>
                        <option value="gu">Gujarati (gu)</option>
                        <option value="ht">Haitian Creole (ht)</option>
                        <option value="ha">Hausa (ha)</option>
                        <option value="haw">Hawaiian (haw)</option>
                        <option value="iw">Hebrew (iw)</option>
                        <option value="hi">Hindi (hi)</option>
                        <option value="hmn">Hmong (hmn)</option>
                        <option value="hu">Hungarian (hu)</option>
                        <option value="is">Icelandic (is)</option>
                        <option value="ig">Igbo (ig)</option>
                        <option value="id">Indonesian (id)</option>
                        <option value="ga">Irish (ga)</option>
                        <option value="it">Italian (it)</option>
                        <option value="ja">Japanese (ja)</option>
                        <option value="jw">Javanese (jw)</option>
                        <option value="kn">Kannada (kn)</option>
                        <option value="kk">Kazakh (kk)</option>
                        <option value="km">Khmer (km)</option>
                        <option value="ko">Korean (ko)</option>
                        <option value="ku">Kurdish (Kurmanji) (ku)</option>
                        <option value="ky">Kyrgyz (ky)</option>
                        <option value="lo">Lao (lo)</option>
                        <option value="la">Latin (la)</option>
                        <option value="lv">Latvian (lv)</option>
                        <option value="lt">Lithuanian (lt)</option>
                        <option value="lb">Luxembourgish (lb)</option>
                        <option value="mk">Macedonian (mk)</option>
                        <option value="mg">Malagasy (mg)</option>
                        <option value="ms">Malay (ms)</option>
                        <option value="ml">Malayalam (ml)</option>
                        <option value="mt">Maltese (mt)</option>
                        <option value="mi">Maori (mi)</option>
                        <option value="mr">Marathi (mr)</option>
                        <option value="mn">Mongolian (mn)</option>
                        <option value="my">Myanmar (Burmese) (my)</option>
                        <option value="ne">Nepali (ne)</option>
                        <option value="no">Norwegian (no)</option>
                        <option value="ps">Pashto (ps)</option>
                        <option value="fa">Persian (fa)</option>
                        <option value="pl">Polish (pl)</option>
                        <option value="pt">Portuguese (pt)</option>
                        <option value="pa">Punjabi (pa)</option>
                        <option value="ro">Romanian (ro)</option>
                        <option value="ru">Russian (ru)</option>
                        <option value="sm">Samoan (sm)</option>
                        <option value="gd">Scots Gaelic (gd)</option>
                        <option value="sr">Serbian (sr)</option>
                        <option value="st">Sesotho (st)</option>
                        <option value="sn">Shona (sn)</option>
                        <option value="sd">Sindhi (sd)</option>
                        <option value="si">Sinhala (si)</option>
                        <option value="sk">Slovak (sk)</option>
                        <option value="sl">Slovenian (sl)</option>
                        <option value="so">Somali (so)</option>
                        <option value="es">Spanish (es)</option>
                        <option value="su">Sundanese (su)</option>
                        <option value="sw">Swahili (sw)</option>
                        <option value="sv">Swedish (sv)</option>
                        <option value="tg">Tajik (tg)</option>
                        <option value="ta">Tamil (ta)</option>
                        <option value="te">Telugu (te)</option>
                        <option value="th">Thai (th)</option>
                        <option value="tr">Turkish (tr)</option>
                        <option value="uk">Ukrainian (uk)</option>
                        <option value="ur">Urdu (ur)</option>
                        <option value="uz">Uzbek (uz)</option>
                        <option value="vi">Vietnamese (vi)</option>
                        <option value="cy">Welsh (cy)</option>
                        <option value="xh">Xhosa (xh)</option>
                        <option value="yi">Yiddish (yi)</option>
                        <option value="yo">Yoruba (yo)</option>
                        <option value="zu">Zulu (zu)</option>
                    </select>
                </div>
                <hr>
                <h6 data-localize="video_background"></h6>
                <fieldset>
                    <div class="form-group">
                        <label for="video-element-back-img" data-localize="or_choose_image">></label>
                        <input type="file" accept=".jpg, .jpeg, .png, .gif" class="form-control" name="video-element-back-img" id="video-element-back-img" value="" />
                    </div>
                    <span data-localize="orchoose_images"></span>
                    <div class="form-group" id="video-element-back-images"></div>
                    <div class="form-group">
                        <img id="video-element-back-preview" src="" width="200" />
                    </div>
                </fieldset>
                <div class="form-group">
                    <h6 data-localize="room_ai"></h6>
                    <input type="text" autocomplete="off" onkeydown="return /[a-zA-Z0-9_]/i.test(event.key)" class="form-control" id="room" name="room" aria-describedby="room">
                </div>
                <div class="form-group">
                    <h6 data-localize="quality_ai"></h6>
                    <select class="form-control" name="quality" id="quality">
                        <option value="low">low</option>
                        <option value="medium" selected>medium</option>
                        <option value="high">high</option>
                    </select>
                </div>
                <h4 data-localize="chat_settings"></h4>
                <div class="form-group">
                    <h6 data-localize="avatar_system"></h6>
                    <textarea class="form-control" rows="4" id="system" name="system">You are a streaming avatar from LiveSmart, leading company that specialize in videos commnucations. Audience will try to have a conversation with you, please try answer the questions or respond their comments naturally, and concisely. - please try your best to response with short answers, and only answer the last question.</textarea>
                </div>
                <div class="form-group">
                    <h6 data-localize="ai_greeting_text"></h6>
                    <textarea class="form-control" rows="4" id="ai_greeting_text" name="ai_greeting_text"></textarea>
                </div>
                <div class="form-group">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input" checked id="is_context">
                        <label class="custom-control-label" for="is_context" data-localize="is_context"></label>
                    </div>
                </div>
                <h6 data-localize="advanced_tools"></h6>
                <h6 data-localize="advanced_tools_info"></h6>
                <div class="wrapper">
                    <fieldset class="element">
                    <hr>
                        <div class="form-group">
                            <h6 data-localize="tools_name"></h6>
                            <input type="text" autocomplete="off" class="form-control" name="tools_name[]" aria-describedby="room">
                        </div>
                        <div class="form-group">
                            <h6 data-localize="tools_description"></h6>
                            <input type="text" autocomplete="off" class="form-control" name="tools_description[]" aria-describedby="room">
                        </div>
                        <div class="form-group">
                            <h6 data-localize="tools_parameters"></h6>
                            <input type="text" autocomplete="off" class="form-control" name="tools_parameters[]" aria-describedby="room">
                        </div>
                    </fieldset>
                    <div class="results"></div>
                    <div class="text-right">
                        <i class="fas fa-plus fa-2x text-300 clone pointer"></i> <i class="fas fa-minus fa-2x text-300 remove pointer"></i>
                    </div>
                </div>
                <h6 data-localize="assitants"></h6>
                <p data-localize="assitants_info"></p>
                <fieldset>
                    <select class="form-control" name="video_ai_assistant" id="video_ai_assistant"></select>
                </fieldset>
                <hr>
                <a href="javascript:void(0);" id="saveAvatars" class="btn btn-primary" data-localize="save">
                </a>
                <a href="javascript:void(0);" id="runAvatars" class="btn btn-secondary" data-localize="start_session">
                </a>
                <input type="hidden" class="form-control" value="" id="video-element-back-hidden">
            </div>
        </div>
        <div class="col-lg-6">
            <div class="p-1">
                <video src="" controls="yes" width="100%" id="videoPreview"></video>
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
        input.addEventListener('change', function() {
            previewPhoto(document.getElementById('video-element-back-preview'), input);
        });

        const folder = 'img/virtual/';

        function handleBacks(id, elem) {
            document.getElementById(elem + '-preview').setAttribute('src', '../' + folder + id);
            $('#' + elem + '-hidden').val(folder + id);
        }
        const backImages = document.getElementById('video-element-back-images');
        for (i = 1; i <= 20; i++) {
            let img = document.createElement('img');
            img.setAttribute('src', '../' + folder + i + '.jpg');
            img.setAttribute('id', i + '.jpg');
            img.setAttribute('width', '80');
            img.setAttribute('style', 'cursor:pointer; padding: 2px;');
            backImages.append(img);
            img.addEventListener('click', function() {
                handleBacks(img.id, 'video-element-back');
            });
        }
    </script>


<?php } else {
    header("Location: dash.php");
    die();
} ?>
<?php
include_once 'footer.php';
