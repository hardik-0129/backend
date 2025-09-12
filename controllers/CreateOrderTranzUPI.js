// class CreateOrderAPI {
//     constructor(apiUrl) {
//         this.apiUrl = apiUrl;
//     }

//     async createOrder(customerMobile, userToken, amount, orderId, redirectUrl, remark1, remark2) {
//         const payload = new URLSearchParams();
//         payload.append('customer_mobile', customerMobile);
//         payload.append('user_token', userToken);
//         payload.append('amount', amount);
//         payload.append('order_id', orderId);
//         payload.append('redirect_url', redirectUrl);
//         payload.append('remark1', remark1);
//         payload.append('remark2', remark2);

//         try {
//             const response = await fetch(this.apiUrl, {
//                 method: 'POST',
//                 headers: {
//                     'Content-Type': 'application/x-www-form-urlencoded'
//                 },
//                 body: payload
//             });

//             const data = await response.json();

//             if (response.ok && data.status === true) {
//                 return data;
//             } else {
//                 throw new Error(data.message || 'Unknown error');
//             }
//         } catch (error) {
//             console.error('Error creating order:', error);
//             throw error;
//         }
//     }
// }

// // Usage for TranzUPI
// const api = new CreateOrderAPI('https://tranzupi.com/api/create-order');
// api.createOrder(
//     '8145344963', // customerMobile
//     'e8d2a2f1ac98d41d3b7422fd11ab98fa', // userToken (TranzUPI user token)
//     '1', // amount
//     '8787772321800', // orderId (your unique order id)
//     'https://khilaadixpro.shop', // redirectUrl (where to redirect after payment)
//     'testremark', // remark1
//     'testremark2' // remark2
// )
// .catch(error => console.error('Order creation failed:', error));
