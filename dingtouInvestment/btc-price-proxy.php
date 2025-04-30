<?php
/**
 * 比特币价格API代理
 * 用于解决前端CORS限制问题
 */

// 设置响应头
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Max-Age: 3600');

// 禁用缓存
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// 定义API端点
$apis = [
    [
        'name' => 'coingecko',
        'url' => 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
        'parse' => function($response) {
            $data = json_decode($response, true);
            if (isset($data['bitcoin']['usd'])) {
                return floatval($data['bitcoin']['usd']);
            }
            return false;
        }
    ],
    [
        'name' => 'coindesk',
        'url' => 'https://api.coindesk.com/v1/bpi/currentprice.json',
        'parse' => function($response) {
            $data = json_decode($response, true);
            if (isset($data['bpi']['USD']['rate_float'])) {
                return floatval($data['bpi']['USD']['rate_float']);
            }
            return false;
        }
    ],
    [
        'name' => 'binance',
        'url' => 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
        'parse' => function($response) {
            $data = json_decode($response, true);
            if (isset($data['price'])) {
                return floatval($data['price']);
            }
            return false;
        }
    ]
];

// 尝试从每个API获取价格
function getBtcPrice() {
    global $apis;
    
    foreach ($apis as $api) {
        try {
            // 创建一个curl资源
            $ch = curl_init($api['url']);
            
            // 设置curl选项
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36');
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Cache-Control: no-cache',
                'Pragma: no-cache'
            ]);
            
            // 获取URL内容
            $response = curl_exec($ch);
            $info = curl_getinfo($ch);
            
            // 检查是否成功
            if ($response !== false && $info['http_code'] === 200) {
                $price = $api['parse']($response);
                
                if ($price !== false) {
                    // 关闭curl资源
                    curl_close($ch);
                    
                    return [
                        'success' => true,
                        'price' => $price,
                        'source' => $api['name'],
                        'timestamp' => time()
                    ];
                }
            }
            
            // 关闭curl资源
            curl_close($ch);
        } catch (Exception $e) {
            // 记录错误但继续尝试下一个API
            error_log("从 {$api['name']} 获取比特币价格失败: " . $e->getMessage());
        }
    }
    
    // 所有API都失败了
    return [
        'success' => false,
        'error' => '无法从任何API获取比特币价格'
    ];
}

// 获取价格并输出JSON
$result = getBtcPrice();
echo json_encode($result, JSON_UNESCAPED_UNICODE); 