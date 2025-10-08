const getFullImageUrl = (imagePath) => {
  if (!imagePath) return null;

  const baseUrl = 'http://192.168.1.7:5000';

  // Always normalize to the path that starts at /uploads
  const uploadsIndex = imagePath.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    const uploadsPath = imagePath.substring(uploadsIndex); // e.g. /uploads/banners/...
    return `${baseUrl}${uploadsPath}`;
  }

  // If already an absolute HTTPS URL but not /uploads (leave as-is)
  if (imagePath.startsWith('https://')) {
    return imagePath;
  }

  // Fallback: treat as relative path
  const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${baseUrl}${normalizedPath}`;
};

const convertBannerToFullUrls = (banner) => {
  if (!banner) return null;
  
  const bannerObj = banner.toObject ? banner.toObject() : banner;
  
  return {
    ...bannerObj,
    backgroundImage: getFullImageUrl(bannerObj.backgroundImage),
    bannerImages: bannerObj.bannerImages?.map(img => getFullImageUrl(img)) || [],
    imageGallery: Array.isArray(bannerObj.imageGallery)
      ? bannerObj.imageGallery.map((g) => ({
          ...g,
          url: getFullImageUrl(g.url)
        }))
      : []
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
