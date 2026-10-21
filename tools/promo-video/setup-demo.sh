#!/usr/bin/env bash
# Prepares a LOCAL demo database so the promo captures show real features: open supply days, delivery fee, badges,
# dietary tags and a dish that is almost out. Usage: setup-demo.sh [baseUrl] (psql connection from PG* env vars)
set -euo pipefail
BASE=${1:-http://localhost:5000}
P="psql -At -h ${PGHOST:-localhost} -U ${PGUSER:-postgres} ${PGDATABASE:-promo}"
$P <<'SQL'
delete from "Orders"; delete from "SupplyDays";
insert into "SupplyDays"("Weekday","Enabled","CutoffDay","CutoffTime","DeliveryFrom","DeliveryTo")
  select d,true,(d+6)%7,time '20:00',time '11:00',time '17:00' from generate_series(0,5) d;
update "Settings" set "DeliveryPricing"='simple',"DeliveryFeeAmount"=15,"DeliveryDiscountMinOrder"=200,
  "BadgeNewEnabled"=true,"BadgeNewAmount"=30,"BadgeNewUnit"='day',
  "BadgeLowStockEnabled"=true,"BadgeLowStockMode"='percent',"BadgeLowStockAmount"=40,
  "DeliveryFeeText"='משלוח באשקלון 15 ₪';
update "Dishes" set "OnSale"=true where "Id" in (1,5);
update "Dishes" set "MaxPerSupplyDate"=10 where "Id"=3;
update "Dishes" set "DietaryTags"='{glutenFree,vegetarian,vegan}' where "Id"=7;
update "Dishes" set "DietaryTags"='{vegetarian}' where "Id"=4;
SQL
DATE=$(date -d "tomorrow" +%F)
for i in 1 2 3 4 5 6 7 8; do
  curl -s -o /dev/null -X POST "$BASE/api/orders" -H 'Content-Type: application/json' -H 'X-Food-Site-Request: 1' \
    -d "{\"phone\":\"05000000$i\",\"name\":\"לקוח דמו $i\",\"supplyDate\":\"$DATE\",\"fulfillmentMethod\":\"Pickup\",\"paymentMethod\":\"OnDelivery\",\"deliveryHour\":\"12:00:00\",\"items\":[{\"dishId\":3,\"quantity\":1,\"addOns\":[]}]}"
done
echo "demo data ready for $DATE"
# a club member with one past order, so "reorder" has something to show
H=(-H 'Content-Type: application/json' -H 'X-Food-Site-Request: 1')
curl -s -o /dev/null -X POST "$BASE/api/account/register" "${H[@]}" -d '{"phone":"0521234567","fullName":"דנה כהן","city":"אשקלון","street":"הרצל","houseNumber":"12","apartment":""}'
curl -s -o /dev/null -X POST "$BASE/api/orders" "${H[@]}" -d "{\"phone\":\"0521234567\",\"name\":\"דנה כהן\",\"city\":\"אשקלון\",\"street\":\"הרצל\",\"houseNumber\":\"12\",\"supplyDate\":\"$DATE\",\"fulfillmentMethod\":\"Pickup\",\"paymentMethod\":\"OnDelivery\",\"deliveryHour\":\"13:00:00\",\"items\":[{\"dishId\":2,\"quantity\":2,\"addOns\":[]},{\"dishId\":13,\"quantity\":1,\"addOns\":[]}]}"
