<?php
function folder_exist($folder) {$path = realpath($folder);return ($path !== false AND is_dir($path)) ? $path : false;}
function BinChecker($n) {
$puxar = post('http://alltoolug.com/webtools/tool/othertool/bin/','listcc='.$n.'&submit=CHECK+NOW');
$banco = str_replace('"','',strip_tags(getStr($puxar,'<td>','</td>',4)));
if(substr($banco, -1) == '.' || substr($banco, -1) == ',') {$banco = substr($banco, 0, -1);}
$classe = str_replace('Visa ','',str_replace('Mastercard ','',str_replace('CREDIT','',str_replace('CREDIT ','',strip_tags(str_replace('&nbsp;','',getStr($puxar,'<td>','</td>',5)))))));
if(!$classe) {$classe = 'UNKNOWN';}
if(!$banco) {$banco = 'UNKNOWN';}
$pais = strip_tags(getStr($puxar,'<td>','</td>',6));
$retornar = '|'.$banco.'|'.$classe.'|'.$pais;
return $retornar;
}
function get_client_ip() {
    $ipaddress = '';
    if (getenv('HTTP_CLIENT_IP'))
        $ipaddress = getenv('HTTP_CLIENT_IP');
    else if(getenv('HTTP_X_FORWARDED_FOR'))
        $ipaddress = getenv('HTTP_X_FORWARDED_FOR');
    else if(getenv('HTTP_X_FORWARDED'))
        $ipaddress = getenv('HTTP_X_FORWARDED');
    else if(getenv('HTTP_FORWARDED_FOR'))
        $ipaddress = getenv('HTTP_FORWARDED_FOR');
    else if(getenv('HTTP_FORWARDED'))
       $ipaddress = getenv('HTTP_FORWARDED');
    else if(getenv('REMOTE_ADDR'))
        $ipaddress = getenv('REMOTE_ADDR');
    else
        $ipaddress = 'UNKNOWN';
    return $ipaddress;
}
function getServerAddress() {
if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
return $_SERVER['SERVER_ADDR'];
}
$firstip = shell_exec('/sbin/ifconfig eth0');
$secondip = shell_exec('/sbin/ifconfig eth0:0');
$thirdip = shell_exec('/sbin/ifconfig eth0:1');
$fourthip = shell_exec('/sbin/ifconfig eth0:2');
$iplist = '';
if(strpos($firstip, 'inet addr:') !== false) {
$iplist .= getStr($firstip,'inet addr:',' ');
}
if(strpos($secondip, 'inet addr:') !== false) {
$iplist .= ','.getStr($secondip,'inet addr:',' ');
}
if(strpos($thirdip, 'inet addr:') !== false) {
$iplist .= ','.getStr($thirdip,'inet addr:',' ');
}
if(strpos($fourthip, 'inet addr:') !== false) {
$iplist .= ','.getStr($fourthip,'inet addr:',' ');
}
return $iplist;
}

function randomIP() {
$iprange = getServerAddress();
$ip = '';
if(strpos($iprange,',') !== false) {
$iprange = explode(',',$iprange);
return $iprange[array_rand($iprange)];
} else {
return $iprange;
}
}

function get($url,$ref = '') {
$cs = curl_init();
curl_setopt($cs, CURLOPT_SSL_VERIFYPEER, FALSE);
curl_setopt($cs, CURLOPT_URL, $url);
if(isset($_GET['ip'])) {
curl_setopt($cs, CURLOPT_INTERFACE, $_GET['ip']);
}
if(isset($_GET['proxy'])) {
curl_setopt($cs, CURLOPT_PROXY, $_GET['proxy']);
}
$headers = array();
if(isset($_GET['authorization'])) {
$headers[] = 'Authorization: '.$_GET['authorization'];
}
if(isset($_GET['content_type'])) {
$headers[] = 'Content-Type: '.$_GET['content_type'];
}
if(isset($_GET['user_agent'])) {
$headers[] = 'User-Agent: '.$_GET['user_agent'];
}
curl_setopt($cs, CURLOPT_HTTPHEADER, $headers);
curl_setopt($cs, CURLOPT_REFERER, $ref);
curl_setopt($cs, CURLOPT_COOKIEFILE, getcwd().'/c/'.$_GET['muuid'].'.txt');
curl_setopt($cs, CURLOPT_COOKIEJAR, getcwd().'/c/'.$_GET['muuid'].'.txt');
curl_setopt($cs, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($cs, CURLOPT_FOLLOWLOCATION, TRUE);
curl_setopt($cs, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT']);
curl_setopt($cs, CURLOPT_TIMEOUT, 25);
return curl_exec ($cs);
curl_close ($cs);
unset($cs);
}
function post($url,$postdata,$ref = '') {
$cs = curl_init();
curl_setopt($cs, CURLOPT_SSL_VERIFYPEER, FALSE);
curl_setopt($cs, CURLOPT_URL, $url);
$headers = array();
if(isset($_GET['authorization'])) {
$headers[] = 'Authorization: '.$_GET['authorization'];
}
if(isset($_GET['user_agent'])) {
$headers[] = 'User-Agent: '.$_GET['user_agent'];
}
if(isset($_GET['content_type'])) {
$headers[] = 'Content-Type: '.$_GET['content_type'];
} else {
$headers[] = 'Content-Type: application/x-www-form-urlencoded';
}

curl_setopt($cs, CURLOPT_HTTPHEADER, $headers);
if(isset($_GET['ip'])) {
curl_setopt($cs, CURLOPT_INTERFACE, $_GET['ip']);
}
if(isset($_GET['proxy'])) {
curl_setopt($cs, CURLOPT_PROXY, $_GET['proxy']);
}
curl_setopt($cs, CURLOPT_COOKIEFILE, getcwd().'/c/'.$_GET['muuid'].'.txt');
curl_setopt($cs, CURLOPT_COOKIEJAR, getcwd().'/c/'.$_GET['muuid'].'.txt');
curl_setopt($cs, CURLOPT_POST, TRUE);
curl_setopt($cs, CURLOPT_POSTFIELDS, $postdata);
curl_setopt($cs, CURLOPT_REFERER, $ref);
curl_setopt($cs, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($cs, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT']);
curl_setopt($cs, CURLOPT_FOLLOWLOCATION, TRUE);
return curl_exec ($cs);
curl_close ($cs);
unset($cs);
}
function put($url,$data,$ref = '') {
$cs = curl_init();
curl_setopt($cs, CURLOPT_SSL_VERIFYPEER, FALSE);
curl_setopt($cs, CURLOPT_URL, $url);
$headers = array();
if(isset($_GET['authorization'])) {
$headers[] = 'Authorization: '.$_GET['authorization'];
}
if(isset($_GET['user_agent'])) {
$headers[] = 'User-Agent: '.$_GET['user_agent'];
}
if(isset($_GET['content_type'])) {
$headers[] = 'Content-Type: '.$_GET['content_type'];
} else {
$headers[] = 'Content-Type: application/x-www-form-urlencoded';
}
curl_setopt($cs, CURLOPT_HTTPHEADER, $headers);
if(isset($_GET['ip'])) {
curl_setopt($cs, CURLOPT_INTERFACE, $_GET['ip']);
}
if(isset($_GET['proxy'])) {
curl_setopt($cs, CURLOPT_PROXY, $_GET['proxy']);
}
curl_setopt($cs, CURLOPT_COOKIEFILE, getcwd().'/c/'.$_GET['muuid'].'.txt');
curl_setopt($cs, CURLOPT_COOKIEJAR, getcwd().'/c/'.$_GET['muuid'].'.txt');
curl_setopt($cs, CURLOPT_PUT, true);
curl_setopt($cs, CURLOPT_POSTFIELDS, $data);
curl_setopt($cs, CURLOPT_REFERER, $ref);
curl_setopt($cs, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($cs, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT']);
curl_setopt($cs, CURLOPT_FOLLOWLOCATION, TRUE);
return curl_exec ($cs);
curl_close ($cs);
unset($cs);
}
function randomstr($length,$wn = 0) {
	if($wn == 0) {
    $characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	} else {
	$characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	}
    $charactersLength = strlen($characters);
    $randomString = '';
    for ($i = 0; $i < $length; $i++) {
        $randomString .= $characters[rand(0, $charactersLength - 1)];
    }
    return $randomString;
}
function getStr($string,$start,$end,$int = 1){ 
    $str = explode($start,$string); 
    $str = explode($end,$str[$int]); 
    return $str[0]; 
}
function mod($dividendo,$divisor)
{
return round($dividendo - (floor($dividendo/$divisor)*$divisor));
}
function cpf($compontos)
{
$n1 = rand(0,9);
$n2 = rand(0,9);
$n3 = rand(0,9);
$n4 = rand(0,9);
$n5 = rand(0,9);
$n6 = rand(0,9);
$n7 = rand(0,9);
$n8 = rand(0,9);
$n9 = rand(0,9);
$d1 = $n9*2+$n8*3+$n7*4+$n6*5+$n5*6+$n4*7+$n3*8+$n2*9+$n1*10;
$d1 = 11 - ( mod($d1,11) );
if ( $d1 >= 10 )
{ $d1 = 0 ;
}
$d2 = $d1*2+$n9*3+$n8*4+$n7*5+$n6*6+$n5*7+$n4*8+$n3*9+$n2*10+$n1*11;
$d2 = 11 - ( mod($d2,11) );
if ($d2>=10) { $d2 = 0 ;}
$retorno = '';
if ($compontos==1) {$retorno = ''.$n1.$n2.$n3.".".$n4.$n5.$n6.".".$n7.$n8.$n9."-".$d1.$d2;}
else {$retorno = ''.$n1.$n2.$n3.$n4.$n5.$n6.$n7.$n8.$n9.$d1.$d2;}
return $retorno;
}
/***********************************************************************************************************************************/

if(!folder_exist('c'))
    mkdir("c/", 0777);
                        
$_GET['muuid'] = randomstr(8);

/***********************************************************************************************************************************/

?>
