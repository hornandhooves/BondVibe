import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

export const makeUserAdmin = async (userId) => {
  try {
    await updateDoc(doc(db, 'users', userId), {
      role: 'admin',
      hostProfile: {
        verified: true,
        eventsHosted: 0,
        rating: 5,
        verifiedAt: new Date().toISOString(),
        bio: 'Kinlo Team',
      },
    });
    console.log('User upgraded to admin!');
    return true;
  } catch (error) {
    console.error('Error making admin:', error);
    return false;
  }
};
