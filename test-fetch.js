import fetch from 'node-fetch';

async function test() {
  const res = await fetch('https://fundmobapi.eastmoney.com/FundMApi/FundVarietieValuationDetail.ashx?FCODE=019172&deviceid=1&plat=Android&product=EFund&version=1');
  const text = await res.text();
  console.log(text);
}

test();
