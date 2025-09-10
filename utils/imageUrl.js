const getFullImageUrl = (imagePath) => {
  if (!imagePath) return null;
  
  if (imagePath.includes('localhost:5000')) {
    return imagePath.replace('localhost:5000', '192.168.1.6:5000');
  }
  
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  const baseUrl = 'http://192.168.1.6:5000';
  const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  
  return `${baseUrl}${normalizedPath}`;
};

const convertBannerToFullUrls = (banner) => {
  if (!banner) return null;
  
  const bannerObj = banner.toObject ? banner.toObject() : banner;
  
  return {
    ...bannerObj,
    backgroundImage: getFullImageUrl(bannerObj.backgroundImage),
    bannerImages: bannerObj.bannerImages?.map(img => getFullImageUrl(img)) || []
  };
};

const convertBannersToFullUrls = (banners) => {
  if (!Array.isArray(banners)) return [];
  
  return banners.map(banner => convertBannerToFullUrls(banner));
};

module.exports = {
  getFullImageUrl,
  convertBannerToFullUrls,
  convertBannersToFullUrls
};
