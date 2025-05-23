<?php
include_once 'connect.php';

function setPk($value, $license) {
    global $pdo, $dbPrefix;
    $phpContent = file_get_contents('connect.php');

    $pos = strpos($phpContent, '$setVal');

    if ($pos === false) {
        $phpContent .= '$setVal = \'\';';
    }

    $str = str_replace('$setVal = \'\';', '$setVal = \'' . $value . '\';', $phpContent);
    file_put_contents('connect.php', $str);
    $array = [$license, 1];
    $sql = 'UPDATE ' . $dbPrefix . 'payment_options SET license=? WHERE payment_option_id = ?';
    $pdo->prepare($sql)->execute($array);
}

function deletePk() {
    global $pdo, $dbPrefix, $setVal;
    $phpContent = file_get_contents('connect.php');

    $pos = strpos($phpContent, '$setVal');

    if ($pos === false) {
        $phpContent .= '$setVal = \'\';';
    }

    $str = str_replace('$setVal = \'' . $setVal . '\';', '$setVal = \'\';', $phpContent);
    file_put_contents('connect.php', $str);
    $array = ['', 1];
    $sql = 'UPDATE ' . $dbPrefix . 'payment_options SET license=? WHERE payment_option_id = ?';
    $pdo->prepare($sql)->execute($array);
}

function zipFolder($folder, $folderName) {

    $rootPath = realpath($folder);

    $zip = new ZipArchive();
    if (file_exists($folderName)) {
        $newFolderName = explode('.zip', $folderName);
        $newFolder = $newFolderName[0] . '(1).zip';
    } else {
        $newFolder = $folderName;
    }
    $zip->open($newFolder, ZipArchive::CREATE);


    $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($rootPath), RecursiveIteratorIterator::LEAVES_ONLY
    );

    foreach ($files as $name => $file) {
        $pos = strrpos($file->getFilename(), '.zip');
        if (!$file->isDir() && $pos === false) {
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($rootPath) + 1);
            $zip->addFile($filePath, $relativePath);
        }
    }

    $zip->close();
}

function updateFiles($arr) {

    $basePath = dirname(__FILE__) . '/../';
    zipFolder($basePath . '/pages', $basePath . '/pages/pages_' . date('Y-m-d_H-i') . '.zip');
    zipFolder($basePath . '/css', $basePath . '/css/css_' . date('Y-m-d_H-i') . '.zip');
    zipFolder($basePath . '/locales', $basePath . '/locales/locales_' . date('Y-m-d_H-i') . '.zip');
    zipFolder($basePath . '/config', $basePath . '/config/config_' . date('Y-m-d_H-i') . '.zip');
    zipFolder($basePath . '/js', $basePath . '/js/js_' . date('Y-m-d_H-i') . '.zip');
    zipFolder($basePath . '/dash', $basePath . '/dash/dash_' . date('Y-m-d_H-i') . '.zip');

    $filesArray = json_decode($arr);
    $files = '';
    foreach ($filesArray as $key => $value) {
        $phpContent = file_get_contents($key);
        $folder = dirname($basePath . $value);
        if (!is_dir($folder)) {
            mkdir($folder, 0777, true);
        }


        file_put_contents($basePath . $value, $phpContent);
        $files .= $value . '<br/>';
    }
    echo $files;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['type']) && $_POST['type'] == 'setpk') {
        echo setPk($_POST['value'], $_POST['license']);
    }
    if (isset($_POST['type']) && $_POST['type'] == 'update') {
        echo updateFiles($_POST['value']);
    }
    if (isset($_POST['type']) && $_POST['type'] == 'delete') {
        echo deletePk();
    }
}
